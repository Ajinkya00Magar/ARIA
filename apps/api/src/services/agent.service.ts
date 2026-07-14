// ─────────────────────────────────────────────────────────────────────────────
// Agent Service — Orchestrates the full agent run
// Uses IBM Orchestrate when IBM_ORCHESTRATE_URL is configured,
// otherwise falls back to the CodingAgent (watsonx).
// ─────────────────────────────────────────────────────────────────────────────

import { eq } from 'drizzle-orm';
import { CodingAgent, WatsonxClient, MemoryManager } from '@ibm-agent/ai';
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

    // Initialize IBM Orchestrate client if URL is configured
    if (env.IBM_ORCHESTRATE_URL) {
      this.orchestrate = new OrchestrateClient({
        agentUrl: env.IBM_ORCHESTRATE_URL,
        apiKey: env.IBM_ORCHESTRATE_API_KEY ?? '',
        bearerToken: env.IBM_ORCHESTRATE_BEARER_TOKEN,
      });
      logger.info(`🤖 IBM Orchestrate agent configured: ${env.IBM_ORCHESTRATE_URL}`);
    } else {
      this.orchestrate = null;
      logger.info('⚡ Using watsonx CodingAgent (set IBM_ORCHESTRATE_URL to use Orchestrate)');
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
    let chatRow: { id: string } | undefined;
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

    // ── Load chat history ──────────────────────────────────────────────────
    const historyRows = opts.workspaceId && chatRow
      ? await db
          .select()
          .from(messages)
          .where(eq(messages.chatId, chatRow.id))
          .orderBy(messages.createdAt)
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
    // KEY ROUTING RULE:
    // • When a workspace is open → ALWAYS use local CodingAgent + ToolExecutor.
    //   This is the only path that can actually write files, run commands, etc.
    //   IBM Orchestrate is a remote cloud LLM — it cannot call our local file tools.
    // • When NO workspace is open → use IBM Orchestrate (if configured) for Q&A,
    //   otherwise fall back to local watsonx CodingAgent.
    let finalContent = '';

    const executor = ws
      ? new ToolExecutor(ws.path, async (cmd) => {
          return permissionService.request(opts.pendingPermissions, cmd, 'terminal', { command: cmd });
        })
      : undefined;

    if (ws && executor) {
      // ── LOCAL CodingAgent with real ToolExecutor (workspace open) ─────────
      // This is the ONLY path that actually creates files, runs commands, etc.
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
        },
        executeToolFn: async (toolName: ToolName, args, _workspaceId) => {
          return executor.execute(toolName, args);
        },
        requestPermissionFn: async (action, description, details) => {
          return permissionService.request(opts.pendingPermissions, action, description, details);
        },
      });
    } else if (this.orchestrate) {
      // ── IBM Orchestrate — no workspace, Q&A only ───────────────────────────
      logger.info('🤖 Routing to IBM Orchestrate (no workspace — Q&A mode)');
      await this.orchestrate.run({
        userMessage: opts.userMessage,
        chatHistory: chatHistory.slice(0, -1).map((m) => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
        })),
        workspaceId: opts.workspaceId,
        systemPrompt: 'You are an expert IBM Coding Agent. Help the user with any coding, architecture, or software engineering task. When the user wants to write or create files, remind them to open a workspace first.',
        onEvent: (event) => {
          opts.onEvent(event);
          if (event.type === 'content_done') {
            finalContent = (event.data as { content: string }).content;
          }
          if (event.type === 'content_delta') {
            finalContent += (event.data as { delta: string }).delta;
          }
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
          return permissionService.request(opts.pendingPermissions, action, description, details);
        },
      });
    }


    // ── Save assistant response (only when workspace exists) ──────────────
    const savedContent = finalContent.trim();
    if (savedContent && opts.workspaceId && chatRow) {
      await db.insert(messages).values({
        id: generateId(),
        chatId: chatRow.id,
        role: 'assistant',
        content: savedContent,
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
