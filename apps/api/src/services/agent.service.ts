// ─────────────────────────────────────────────────────────────────────────────
// Agent Service — Orchestrates the full agent run
// Uses IBM Orchestrate when IBM_ORCHESTRATE_URL is configured,
// otherwise falls back to the CodingAgent (watsonx).
// ─────────────────────────────────────────────────────────────────────────────

import { CodingAgent, WatsonxClient, MemoryManager, buildSystemPrompt } from '@ibm-agent/ai';
import { ToolExecutor } from '@ibm-agent/tools';
import { generateId, createConsoleLogger } from '@ibm-agent/shared';
import type { AgentEvent, ProjectSummary, ToolName } from '@ibm-agent/types';
import { workspaceService } from './workspace.service';
import { getChat, updateChats, type ChatRecord } from '../lib/store';
import { env } from '../lib/env';
import { permissionService } from './permission.service';
import { OrchestrateClient } from './orchestrate.client';
import { CloudProxyClient } from './cloud-proxy.client';

const logger = createConsoleLogger('info');

interface AgentRunOptions {
  chatId: string;
  workspaceId: string;
  userId: string;
  token?: string;
  chatHistory?: any[];
  userMessage: string;
  onEvent: (event: AgentEvent) => void;
  pendingPermissions: Map<string, (approved: boolean) => void>;
}

class AgentService {
  private readonly watsonx: WatsonxClient;
  private readonly agent: CodingAgent;
  private readonly orchestrate: OrchestrateClient | null;
  private readonly cloudProxy: CloudProxyClient;

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
    this.cloudProxy = new CloudProxyClient();

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
    // ── Load workspace (optional — allow chat without a workspace) ─────────
    let ws: { id: string; path: string; projectSummary: unknown } | undefined;
    if (opts.workspaceId && env.IS_CLOUD_PROXY !== 'true') {
      const record = await workspaceService.getRecord(opts.workspaceId);
      if (record) {
        ws = { id: record.id, path: record.path, projectSummary: record.projectSummary };
      }
    }

    // ── Load or create chat, persist user message into <folder>/.aria ───────
    let chatRow: { id: string; orchestrateThreadId?: string | null } | undefined;
    if (ws && env.IS_CLOUD_PROXY !== 'true') {
      const wsPath = ws.path;
      const existing = opts.chatId ? await getChat(wsPath, opts.chatId) : undefined;
      const chatId = existing?.id ?? (opts.chatId || generateId());
      const now = new Date().toISOString();

      await updateChats(wsPath, (chats) => {
        let chat = chats.find((c) => c.id === chatId);
        if (!chat) {
          chat = {
            id: chatId,
            workspaceId: opts.workspaceId,
            userId: opts.userId,
            title: opts.userMessage.slice(0, 80),
            createdAt: now,
            updatedAt: now,
            messages: [],
          };
          chats.push(chat);
        }
        chat.messages.push({
          id: generateId(),
          chatId,
          role: 'user',
          content: opts.userMessage,
          createdAt: now,
        });
        chat.updatedAt = now;
      });

      const saved = await getChat(wsPath, chatId);
      chatRow = { id: chatId, orchestrateThreadId: saved?.orchestrateThreadId ?? null };
    } else {
      chatRow = { id: opts.chatId || generateId() };
    }

    opts.onEvent({
      type: 'chat_info',
      data: { chatId: chatRow.id },
      timestamp: new Date(),
    });

    // ── Load chat history ──────────────────────────────────────────────────
    let historyRows: any[] = [];
    if (env.IS_CLOUD_PROXY === 'true') {
      // In Cloud Proxy, frontend/local sends the history in opts (needs to be added to opts if it's not there!)
      // Wait, let's just add `chatHistory` to opts!
      historyRows = opts.chatHistory || [];
      // Also append the new user message
      historyRows.push({
        id: generateId(),
        chatId: chatRow.id,
        role: 'user',
        content: opts.userMessage,
        createdAt: new Date().toISOString(),
      });
    } else if (ws) {
      const savedChat: ChatRecord | undefined = await getChat(ws.path, chatRow.id);
      historyRows = savedChat?.messages ?? [];
    } else {
      historyRows = [
         { id: generateId(), chatId: chatRow.id, role: 'user', content: opts.userMessage, createdAt: new Date().toISOString() }
      ];
    }

    const chatHistory = historyRows.map((m) => ({
      id: m.id,
      chatId: m.chatId,
      role: m.role as 'user' | 'assistant' | 'system' | 'tool',
      content: m.content,
      toolCalls: m.toolCalls as never,
      toolResults: m.toolResults as never,
      toolCallId: m.toolCallId,
      name: m.name,
      createdAt: new Date(m.createdAt),
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
        ws &&
        chatRow &&
        result.threadId !== chatRow.orchestrateThreadId
      ) {
        const threadId = result.threadId;
        await updateChats(ws.path, (chats) => {
          const chat = chats.find((c) => c.id === chatRow!.id);
          if (chat) {
            chat.orchestrateThreadId = threadId;
            chat.updatedAt = new Date().toISOString();
          }
        });
      }
    } else if (env.CLOUD_PROXY_URL) {
      // ── CLOUD PROXY CodingAgent (Yields tools to client) ─────────
      logger.info(`☁️ Routing to Cloud Proxy at ${env.CLOUD_PROXY_URL}`);
      
      let loopCount = 0;
      let currentHistory = chatHistory.slice(0, -1);
      const userMessage = opts.userMessage;

      while (loopCount < 20) {
        loopCount++;
        const result = await this.cloudProxy.run({
          workspaceId: opts.workspaceId,
          token: opts.token,
          proxyUrl: env.CLOUD_PROXY_URL,
          isContinuation: loopCount > 1,
          chatHistory: currentHistory,
          userMessage: loopCount === 1 ? userMessage : "",
          projectSummary: ws?.projectSummary ?? null, 
          onEvent: opts.onEvent,
        });

        // The chunk contains the text returned by the model so far
        finalContent += result.content;

        if (result.toolCalls && result.toolCalls.length > 0) {
          // Add assistant message with tool calls to history
          currentHistory.push({
            id: generateId(),
            chatId: chatRow!.id,
            role: 'assistant',
            content: result.content,
            toolCalls: result.toolCalls as never,
            toolResults: [] as never,
            toolCallId: undefined,
            name: undefined,
            createdAt: new Date(),
          });

          for (const tc of result.toolCalls) {
            toolCalls.push(tc);
            let output = '';
            
            opts.onEvent({
              type: 'tool_start',
              data: { toolCallId: tc.id, toolName: tc.name, arguments: tc.arguments },
              timestamp: new Date()
            });

            if (executor) {
              try {
                output = await executor.execute(tc.name as ToolName, typeof tc.arguments === 'string' ? JSON.parse(tc.arguments) : tc.arguments);
              } catch (e) {
                output = String(e);
              }
            } else {
              output = `Tool "${tc.name}" requires an open workspace. Please open a workspace first.`;
            }

            opts.onEvent({
              type: 'tool_end',
              data: { toolCallId: tc.id, toolName: tc.name, output, duration: 0 },
              timestamp: new Date()
            });
            toolResults.push({ id: tc.id, name: tc.name, output });
            
            // Add tool response to history
            currentHistory.push({
              id: generateId(),
              chatId: chatRow!.id,
              role: 'tool',
              content: output,
              toolCallId: tc.id,
              name: tc.name,
              createdAt: new Date(),
            } as any);
          }
        } else {
          // No more tool calls, we are done
          break;
        }
      }
    } else if (env.IS_CLOUD_PROXY === 'true') {
      // ── CLOUD PROXY CodingAgent (Yields tools to client) ─────────
      logger.info(`☁️ Running Cloud Proxy CodingAgent (yieldForTools: true)`);
      
      await this.agent.run({
        workspaceId: opts.workspaceId,
        userId: opts.userId,
        chatHistory: chatHistory.slice(0, -1),
        userMessage: opts.userMessage,
        // In Cloud Proxy, projectSummary should be passed in via opts. We don't have it locally.
        // For now, allow the agent to run without it or add it to opts later.
        projectSummary: null, 
        memories: [],
        // yieldForTools: true, // Not supported in this version, handled natively by CodingAgent hooks
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
        executeToolFn: async (toolName, args, _workspaceId) => {
          return ''; // Cloud proxy yields execution to the client
        },
        requestPermissionFn: async (action, description, details) => {
          return true; // Permissions are handled by the client
        },
      });
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
    if ((savedContent || toolCalls.length > 0) && ws && chatRow && env.IS_CLOUD_PROXY !== 'true') {
      const now = new Date().toISOString();
      await updateChats(ws.path, (chats) => {
        const chat = chats.find((c) => c.id === chatRow!.id);
        if (chat) {
          chat.messages.push({
            id: generateId(),
            chatId: chat.id,
            role: 'assistant',
            content: savedContent,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
            toolResults: toolResults.length > 0 ? toolResults : undefined,
            createdAt: now,
          });
          chat.updatedAt = now;
        }
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
