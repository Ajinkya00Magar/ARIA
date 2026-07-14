// ─────────────────────────────────────────────────────────────────────────────
// ARIA Agent Service — IBM watsonx Orchestrate is the primary agent
//
// Routing priority:
//   1. IBM_ORCHESTRATE_URL configured → OrchestrateClient (always, with or without workspace)
//      Local ToolExecutor provides file/terminal/git capabilities as tools
//   2. No Orchestrate URL → CodingAgent (local watsonx fallback)
// ─────────────────────────────────────────────────────────────────────────────

import { eq } from 'drizzle-orm';
import { CodingAgent, WatsonxClient } from '@ibm-agent/ai';
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
  runId?: string;
  abortSignal?: AbortSignal;
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

    if (env.IBM_ORCHESTRATE_URL) {
      this.orchestrate = new OrchestrateClient({
        agentUrl: env.IBM_ORCHESTRATE_URL,
        apiKey: env.IBM_ORCHESTRATE_API_KEY ?? '',
        bearerToken: env.IBM_ORCHESTRATE_BEARER_TOKEN,
      });
      logger.info(`🤖 ARIA: IBM watsonx Orchestrate configured as primary agent: ${env.IBM_ORCHESTRATE_URL}`);
    } else {
      this.orchestrate = null;
      logger.info('⚡ ARIA: Using watsonx CodingAgent fallback (set IBM_ORCHESTRATE_URL to use Orchestrate)');
    }
  }

  async run(opts: AgentRunOptions): Promise<void> {
    const db = getDb();
    const runId = opts.runId ?? generateId();

    // ── Load workspace ─────────────────────────────────────────────────────
    let ws: { id: string; path: string; projectSummary: unknown } | undefined;
    if (opts.workspaceId) {
      const [found] = await db
        .select()
        .from(workspaces)
        .where(eq(workspaces.id, opts.workspaceId))
        .limit(1);
      ws = found;
    }

    // ── Load or create chat ────────────────────────────────────────────────
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
      await db.insert(messages).values({
        id: generateId(),
        chatId: chatRow!.id,
        role: 'user',
        content: opts.userMessage,
      });
    } else {
      chatRow = { id: opts.chatId || generateId() };
    }

    // ── Load chat history ──────────────────────────────────────────────────
    const historyRows =
      opts.workspaceId && chatRow
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

    // ── Build workspace tool executor ──────────────────────────────────────
    const executor = ws
      ? new ToolExecutor(ws.path, async (cmd) => {
          return permissionService.request(opts.pendingPermissions, cmd, 'terminal', { command: cmd });
        })
      : undefined;

    let finalContent = '';

    // ── ROUTING: IBM Orchestrate is PRIMARY when configured ────────────────
    if (this.orchestrate) {
      // ── PATH A: IBM watsonx Orchestrate (primary, always when configured) ─
      const systemPrompt = this.buildSystemPrompt(ws);
      logger.info(`🤖 [${runId}] Routing to IBM watsonx Orchestrate (primary agent path)`);

      await this.orchestrate.run({
        userMessage: opts.userMessage,
        chatHistory: chatHistory.slice(0, -1).map((m) => ({
          role: m.role as 'user' | 'assistant' | 'system',
          content: m.content,
        })),
        workspaceId: opts.workspaceId,
        systemPrompt,
        runId,
        onEvent: (event) => {
          opts.onEvent(event);
          if (event.type === 'content_done') {
            finalContent = (event.data as { content: string }).content;
          }
          if (event.type === 'content_delta') {
            finalContent += (event.data as { delta: string }).delta;
          }
        },
        // When workspace is open, provide real tool execution
        executeToolFn: executor
          ? async (toolName: string, args: Record<string, unknown>) => {
              return executor.execute(toolName as ToolName, args);
            }
          : undefined,
        requestPermissionFn: async (action, description, details) => {
          return permissionService.request(opts.pendingPermissions, action, description, details);
        },
      });
    } else if (ws && executor) {
      // ── PATH B: Local CodingAgent + ToolExecutor (no Orchestrate configured) ─
      const projectSummary = ws.projectSummary as ProjectSummary | null;
      logger.info(`⚡ [${runId}] Running local CodingAgent for workspace: ${ws.path}`);

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
    } else {
      // ── PATH C: Fallback — no Orchestrate, no workspace ───────────────────
      logger.info(`⚡ [${runId}] Running local CodingAgent (no workspace, no Orchestrate)`);

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
        executeToolFn: async (toolName: ToolName) => {
          return `Tool "${toolName}" requires an open workspace. Please open a workspace first.`;
        },
        requestPermissionFn: async (action, description, details) => {
          return permissionService.request(opts.pendingPermissions, action, description, details);
        },
      });
    }

    // ── Persist assistant response ─────────────────────────────────────────
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

  private buildSystemPrompt(ws: { path: string; projectSummary: unknown } | undefined): string {
    const basePrompt = `You are ARIA (Agentic Repository Intelligence Assistant), an expert AI coding agent powered by IBM watsonx Orchestrate. You help developers write, debug, test, and understand code with deep repository intelligence.

You have access to tools that let you read and write files, run commands in the terminal, search code, manage git, and analyze projects. Use them proactively to complete tasks thoroughly.

When working on code:
- Always read relevant files before making changes
- Validate your changes by running builds or tests when appropriate
- Provide clear explanations of what you changed and why
- Handle errors gracefully and iterate to fix them`;

    if (!ws) {
      return basePrompt + '\n\nNote: No workspace is currently open. Help the user with coding questions, but remind them to open a workspace if they want file operations.';
    }

    return basePrompt + `\n\nWorkspace: ${ws.path}`;
  }

  resolvePermission(requestId: string, approved: boolean): boolean {
    return permissionService.resolve(requestId, approved);
  }

  get isOrchestrateEnabled(): boolean {
    return this.orchestrate !== null;
  }
}

export const agentService = new AgentService();
