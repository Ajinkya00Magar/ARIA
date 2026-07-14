// ─────────────────────────────────────────────────────────────────────────────
// Agent Service — Orchestrates the full agent run
// Uses IBM Orchestrate when IBM_ORCHESTRATE_URL is configured,
// otherwise falls back to the CodingAgent (watsonx).
// ─────────────────────────────────────────────────────────────────────────────

import { eq } from 'drizzle-orm';
import { CodingAgent, WatsonxClient, MemoryManager, buildSystemPrompt } from '@ibm-agent/ai';
import { ToolExecutor } from '@ibm-agent/tools';
import { generateId, createConsoleLogger } from '@ibm-agent/shared';
import type { AgentEvent, ProjectSummary, ToolName } from '@ibm-agent/types';
import { getDb } from '../db/connection';
import { chats, messages, workspaces } from '../db/schema';
import { env } from '../lib/env';
import { permissionService } from './permission.service';
import { OrchestrateClient } from './orchestrate.client';

const logger = createConsoleLogger('info');

interface AgentRunOptions {
  chatId: string;
  workspaceId: string;
  userId: string;
  userMessage: string;
  onEvent: (event: AgentEvent) => void;
  pendingPermissions: Map<string, (approved: boolean) => void>;
}

class AgentService {
  private readonly watsonx: WatsonxClient;
  private readonly agent: CodingAgent;
  private readonly orchestrate: OrchestrateClient | null;

  constructor() {
    this.watsonx = new WatsonxClient({
      apiKey: env.IBM_CLOUD_API_KEY,
      projectId: env.IBM_PROJECT_ID,
      baseUrl: env.IBM_WATSONX_URL,
      region: env.IBM_REGION,
      modelId: env.IBM_MODEL_ID,
      parameters: { temperature: 0.2, maxNewTokens: 4096 },
    });
    this.agent = new CodingAgent(this.watsonx);

    // IBM Orchestrate is opt-in: the platform agent carries its own
    // instructions and Flows (which can lock the chat with "A new flow has
    // started...") and may ignore per-request tool definitions. Only route
    // through it when USE_ORCHESTRATE=true is set explicitly.
    if (env.USE_ORCHESTRATE && env.IBM_ORCHESTRATE_URL) {
      this.orchestrate = new OrchestrateClient({
        agentUrl: env.IBM_ORCHESTRATE_URL,
        apiKey: env.IBM_ORCHESTRATE_API_KEY ?? '',
        bearerToken: env.IBM_ORCHESTRATE_BEARER_TOKEN,
      });
      logger.info(`🤖 IBM Orchestrate agent configured: ${env.IBM_ORCHESTRATE_URL}`);
    } else {
      this.orchestrate = null;
      if (env.IBM_ORCHESTRATE_URL) {
        logger.info('⚡ IBM_ORCHESTRATE_URL is set but USE_ORCHESTRATE is not true — using local watsonx CodingAgent');
      } else {
        logger.info('⚡ Using watsonx CodingAgent');
      }
    }
  }

  async run(opts: AgentRunOptions): Promise<void> {
    const db = getDb();

    // ── Load workspace (optional — allow chat without a workspace) ─────────
    let ws: { id: string; path: string; projectSummary: unknown } | undefined;
    if (opts.workspaceId) {
      const [found] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, opts.workspaceId))
        .limit(1);
      ws = found;
    }

    // ── Load or create chat (skip if no workspace — notNull constraint) ──────
    let chatRow: { id: string; orchestrateThreadId?: string | null } | undefined;
    if (opts.workspaceId) {
      if (opts.chatId) {
        const [found] = await db.select().from(chats).where(eq(chats.id, opts.chatId)).limit(1);
        chatRow = found;
      }
      if (!chatRow) {
        const [inserted] = await db
          .insert(chats)
          .values({
            id: opts.chatId || generateId(),
            workspaceId: opts.workspaceId,
            userId: opts.userId,
            title: opts.userMessage.slice(0, 80),
          })
          .returning();
        chatRow = inserted;
      }
      // Save user message to DB
      await db.insert(messages).values({
        id: generateId(),
        chatId: chatRow!.id,
        role: 'user',
        content: opts.userMessage,
      });
    } else {
      // No workspace — use an ephemeral chat ID (not persisted)
      chatRow = { id: opts.chatId || generateId() };
    }

    // Tell the client which chat this run belongs to so it can reuse the id
    // on the next turn (otherwise the conversation context is lost).
    opts.onEvent({
      type: 'chat_info',
      data: { chatId: chatRow.id },
      timestamp: new Date(),
    });

    // ── Load chat history ──────────────────────────────────────────────────
    // Secondary sort on id: createdAt has second granularity in SQLite, so
    // same-second messages can reorder without it.
    const historyRows = opts.workspaceId && chatRow
      ? await db
          .select()
          .from(messages)
          .where(eq(messages.chatId, chatRow.id))
          .orderBy(messages.createdAt, messages.id)
      : [];

    const chatHistory = historyRows.map((m) => ({
      id: m.id,
      chatId: m.chatId,
      role: m.role as 'user' | 'assistant' | 'system' | 'tool',
      content: m.content,
      toolCalls: m.toolCalls as never,
      toolResults: m.toolResults as never,
      createdAt: m.createdAt,
    }));

    // ── Choose agent backend ───────────────────────────────────────────────
    let finalContent = '';
    const toolCalls: any[] = [];
    const toolResults: any[] = [];

    const executor = ws
      ? new ToolExecutor(ws.path, async (cmd) => {
          return permissionService.request(
            opts.pendingPermissions,
            cmd,
            'terminal',
            { command: cmd },
            opts.onEvent,
          );
        })
      : undefined;

    if (this.orchestrate) {
      logger.info(
        ws
          ? `🤖 Routing to IBM Orchestrate with local workspace tools: ${ws.path}`
          : '🤖 Routing to IBM Orchestrate (no workspace — Q&A mode)'
      );
      const result = await this.orchestrate.run({
        userMessage: opts.userMessage,
        // Server-side thread continuity (X-IBM-THREAD-ID) is the reliable
        // context mechanism for Orchestrate; local history is the fallback
        // replayed only on the first turn of a chat (no thread yet).
        threadId: chatRow?.orchestrateThreadId ?? undefined,
        chatHistory: chatHistory.slice(0, -1).flatMap((m) => {
          const msgs: any[] = [];
          
          // Add the assistant message with tool calls if they exist
          const astMsg: any = {
            role: m.role === 'tool' ? 'assistant' : m.role,
            content: m.content || '',
          };
          if (m.toolCalls && (m.toolCalls as any[]).length > 0) {
            astMsg.tool_calls = (m.toolCalls as any[]).map((tc: any) => ({
              id: tc.id,
              type: 'function',
              function: {
                name: tc.name,
                arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments)
              }
            }));
          }
          msgs.push(astMsg);
          
          // If this assistant message had tool results, we need to append the tool response messages
          if (m.toolResults && (m.toolResults as any[]).length > 0) {
            for (const tr of (m.toolResults as any[])) {
              msgs.push({
                role: 'tool',
                tool_call_id: tr.id,
                name: tr.name,
                content: tr.output,
              });
            }
          }
          return msgs;
        }),
        workspaceId: opts.workspaceId,
        systemPrompt: ws
          ? buildSystemPrompt(ws.projectSummary as ProjectSummary | null, [])
          : 'You are an expert IBM Coding Agent. Help the user with any coding, architecture, or software engineering task. When the user wants to write or create files, remind them to open a workspace first.',
        executeToolFn: ws && executor ? async (toolName, args) => {
          return executor.execute(toolName, args);
        } : undefined,
        onEvent: (event) => {
          opts.onEvent(event);
          if (event.type === 'content_done') {
            finalContent = (event.data as { content: string }).content;
          }
          if (event.type === 'content_delta') {
            finalContent += (event.data as { delta: string }).delta;
          }
          if (event.type === 'tool_start') {
            const data = event.data as any;
            toolCalls.push({ id: data.toolCallId, name: data.toolName, arguments: data.arguments });
          }
          if (event.type === 'tool_end') {
            const data = event.data as any;
            toolResults.push({ id: data.toolCallId, name: data.toolName, output: data.output });
          }
        },
      });

      // Persist the platform thread id so the next turn continues the same
      // server-side conversation (this is what gives Aria her memory).
      if (
        result.threadId &&
        opts.workspaceId &&
        chatRow &&
        result.threadId !== chatRow.orchestrateThreadId
      ) {
        await db
          .update(chats)
          .set({ orchestrateThreadId: result.threadId, updatedAt: new Date() })
          .where(eq(chats.id, chatRow.id));
      }
    } else if (ws && executor) {
      // ── LOCAL CodingAgent with real ToolExecutor (workspace open) ─────────
      const projectSummary = ws.projectSummary as ProjectSummary | null;
      logger.info(`⚡ Running local CodingAgent for workspace: ${ws.path}`);

      await this.agent.run({
        workspaceId: opts.workspaceId,
        userId: opts.userId,
        chatHistory: chatHistory.slice(0, -1),
        userMessage: opts.userMessage,
        projectSummary: projectSummary ?? null,
        memories: [],
        onEvent: (event) => {
          opts.onEvent(event);
          if (event.type === 'content_done') {
            finalContent = (event.data as { content: string }).content;
          }
          if (event.type === 'content_delta') {
            finalContent += (event.data as { delta: string }).delta;
          }
          if (event.type === 'tool_start') {
            const data = event.data as any;
            toolCalls.push({ id: data.toolCallId, name: data.toolName, arguments: data.arguments });
          }
          if (event.type === 'tool_end') {
            const data = event.data as any;
            toolResults.push({ id: data.toolCallId, name: data.toolName, output: data.output });
          }
        },
        executeToolFn: async (toolName: ToolName, args, _workspaceId) => {
          return executor.execute(toolName, args);
        },
        requestPermissionFn: async (action, description, details) => {
          return permissionService.request(
            opts.pendingPermissions,
            action,
            description,
            details,
            opts.onEvent,
          );
        },
      });
    } else {
      // ── Local watsonx — no workspace, no Orchestrate ───────────────────────
      logger.info('⚡ Running local CodingAgent (no workspace — watsonx Q&A)');
      await this.agent.run({
        workspaceId: 'ephemeral',
        userId: opts.userId,
        chatHistory: chatHistory.slice(0, -1),
        userMessage: opts.userMessage,
        projectSummary: null,
        memories: [],
        onEvent: (event) => {
          opts.onEvent(event);
          if (event.type === 'content_done') {
            finalContent = (event.data as { content: string }).content;
          }
          if (event.type === 'content_delta') {
            finalContent += (event.data as { delta: string }).delta;
          }
        },
        executeToolFn: async (toolName: ToolName, _args, _workspaceId) => {
          return `Tool "${toolName}" requires an open workspace. Please open a workspace first.`;
        },
        requestPermissionFn: async (action, description, details) => {
          return permissionService.request(
            opts.pendingPermissions,
            action,
            description,
            details,
            opts.onEvent,
          );
        },
      });
    }


    // ── Save assistant response (only when workspace exists) ──────────────
    const savedContent = finalContent.trim();
    if ((savedContent || toolCalls.length > 0) && opts.workspaceId && chatRow) {
      await db.insert(messages).values({
        id: generateId(),
        chatId: chatRow.id,
        role: 'assistant',
        content: savedContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : null,
        toolResults: toolResults.length > 0 ? toolResults : null,
      });
    }
  }

  /**
   * Simple watsonx text generation without the full CodingAgent tool loop.
   * Used when no workspace is open and IBM_ORCHESTRATE_URL is not configured.
   */
  private async runSimpleWatsonxChat(
    opts: AgentRunOptions,
    chatHistory: { role: string; content: string }[],
    _finalContent: string,
  ): Promise<void> {
    // Emit a status update so the UI knows the agent is thinking
    opts.onEvent({
      type: 'status_update',
      data: { status: 'thinking' },
      timestamp: new Date(),
    });

    // Build a helpful fallback response
    const fallback =
      'I am ready to help! Please open a workspace first so I can read and write code. ' +
      'You can create or open a workspace from the Workspaces page.';

    for (let i = 0; i < fallback.length; i += 8) {
      opts.onEvent({
        type: 'content_delta',
        data: { delta: fallback.slice(i, i + 8) },
        timestamp: new Date(),
      });
      await new Promise((r) => setTimeout(r, 10));
    }

    opts.onEvent({ type: 'content_done', data: { content: fallback }, timestamp: new Date() });
    opts.onEvent({ type: 'status_update', data: { status: 'done' }, timestamp: new Date() });
  }

  resolvePermission(requestId: string, approved: boolean): boolean {
    return permissionService.resolve(requestId, approved);
  }

  /** Returns whether the IBM Orchestrate client is configured */
  get isOrchestrateEnabled(): boolean {
    return this.orchestrate !== null;
  }
}

export const agentService = new AgentService();
