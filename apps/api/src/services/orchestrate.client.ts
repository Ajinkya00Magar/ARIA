// ─────────────────────────────────────────────────────────────────────────────
// IBM Orchestrate Agent Client
// Connects to an IBM Orchestrate agent endpoint and converts its responses
// to the internal AgentEvent streaming format.
// ─────────────────────────────────────────────────────────────────────────────

import type { AgentEvent, ToolCall } from '@ibm-agent/types';
import { AGENT_TOOLS, extractToolCallsFromText } from '@ibm-agent/ai';

export interface OrchestrateMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  name?: string;
  tool_calls?: any[];
  tool_call_id?: string;
}

export interface OrchestrateRunOptions {
  userMessage: string;
  chatHistory: OrchestrateMessage[];
  workspaceId?: string;
  systemPrompt?: string;
  /**
   * watsonx Orchestrate server-side thread id. When set, it is sent as the
   * X-IBM-THREAD-ID header so the platform keeps the conversation continuous
   * — Orchestrate agents do NOT reliably honor client-replayed history, so
   * this is the primary context mechanism.
   */
  threadId?: string;
  onEvent: (event: AgentEvent) => void;
  executeToolFn?: (toolName: any, args: any) => Promise<string>;
}

export interface OrchestrateRunResult {
  /** Thread id returned by the platform — persist and reuse on the next turn */
  threadId?: string;
}

export interface OrchestrateConfig {
  /** Base URL of your IBM Orchestrate agent endpoint (e.g. https://your-org.orchestrate.ibm.com/instances/ID/agent/run) */
  agentUrl: string;
  /** API key for authenticating with the Orchestrate agent */
  apiKey: string;
  /** Optional IBM Cloud bearer token — takes precedence over apiKey if set */
  bearerToken?: string;
  /** Timeout in ms (default: 120000) */
  timeoutMs?: number;
}

/**
 * Lightweight client for IBM Orchestrate agents.
 *
 * Handles two response modes:
 *   1. Streaming SSE  — if the endpoint returns text/event-stream
 *   2. JSON REST      — if the endpoint returns application/json
 *
 * In both cases the output is mapped to AgentEvent objects and fired via onEvent.
 */
export class OrchestrateClient {
  private readonly config: Required<OrchestrateConfig>;
  /** thread_id observed in the most recent SSE/JSON payload (if any) */
  private lastSeenThreadId?: string;

  constructor(config: OrchestrateConfig) {
    this.config = {
      agentUrl: config.agentUrl,
      apiKey: config.apiKey,
      bearerToken: config.bearerToken ?? '',
      timeoutMs: config.timeoutMs ?? 120_000,
    };
  }

  private get authHeaders(): Record<string, string> {
    if (this.config.bearerToken) {
      return { Authorization: `Bearer ${this.config.bearerToken}` };
    }
    // Fallback just in case, but we should always have a bearer token now
    return { 'X-API-Key': this.config.apiKey };
  }

  private async getIamToken(): Promise<string> {
    if (!this.config.apiKey) return '';
    const body = new URLSearchParams();
    body.append('grant_type', 'urn:ibm:params:oauth:grant-type:apikey');
    body.append('apikey', this.config.apiKey.trim());

    const iamRes = await fetch("https://iam.cloud.ibm.com/identity/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body
    });
    if (!iamRes.ok) {
      throw new Error(`Failed to authenticate with IBM Cloud: ${iamRes.statusText}`);
    }
    const data = await iamRes.json() as any;
    return data.access_token;
  }

  /**
   * Run the Orchestrate agent and stream events back.
   * Supports both SSE and plain JSON responses.
   *
   * Context strategy: the Orchestrate chat/completions endpoint does NOT
   * reliably honor client-replayed message history — the only dependable
   * context mechanism is the platform's own thread (X-IBM-THREAD-ID header).
   * We pass opts.threadId when we have one and return the thread id from the
   * response so the caller can persist it per chat.
   */
  async run(opts: OrchestrateRunOptions): Promise<OrchestrateRunResult> {
    if (!this.config.bearerToken && this.config.apiKey) {
      this.config.bearerToken = await this.getIamToken();
    }

    let iterations = 0;
    const maxIterations = 30;
    let threadId: string | undefined = opts.threadId;

    // Messages for the NEXT request. With a server-side thread, we only send
    // the new turn (the platform already holds prior context). Without one
    // (first turn of a chat), we replay local history as a best effort.
    let pendingMessages: any[] = [];
    if (!threadId && opts.chatHistory.length > 0) {
      pendingMessages.push(...opts.chatHistory);
    }
    pendingMessages.push({ role: 'user', content: opts.userMessage });

    // Convert AgentTools to OpenAI function tools (some backends honor them)
    const tools = AGENT_TOOLS.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }
    }));

    const cleanOrchestrateMessages = (msgs: any[]): any[] => {
      const result: any[] = [];
      for (const msg of msgs) {
        const prev = result[result.length - 1];
        if (prev && prev.role === msg.role && msg.role !== 'tool') {
          prev.content = (prev.content || '') + '\n\n' + (msg.content || '');
          if (msg.tool_calls) {
            prev.tool_calls = [...(prev.tool_calls || []), ...msg.tool_calls];
          }
        } else {
          result.push({ ...msg });
        }
      }
      return result;
    };

    while (iterations < maxIterations) {
      iterations++;

      const rawMessages = [
        ...(opts.systemPrompt && !threadId
          ? [{ role: 'system', content: opts.systemPrompt }]
          : []),
        ...pendingMessages,
      ];

      const body: any = {
        messages: cleanOrchestrateMessages(rawMessages),
        stream: true,
      };

      if (opts.executeToolFn && tools.length > 0) {
        body.tools = tools;
        body.tool_choice = 'auto';
      }

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

      try {
        const response = await fetch(this.config.agentUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream, application/json',
            ...(threadId ? { 'X-IBM-THREAD-ID': threadId } : {}),
            ...this.authHeaders,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => response.statusText);
          throw new Error(`Orchestrate agent HTTP ${response.status}: ${errText}`);
        }

        const contentType = response.headers.get('content-type') ?? '';
        let toolCalls: any[] = [];
        let assistantMessageContent = '';
        let contentDoneEmitted = false;

        const trackingOnEvent = (event: AgentEvent) => {
          opts.onEvent(event);
          if (event.type === 'content_delta') {
            assistantMessageContent += (event.data as any).delta;
          } else if (event.type === 'content_done') {
            assistantMessageContent = (event.data as any).content || assistantMessageContent;
            contentDoneEmitted = true;
          }
        };

        if (contentType.includes('text/event-stream')) {
          toolCalls = await this.handleSSEStream(response, trackingOnEvent);
        } else {
          const jsonRes = await this.handleJsonResponse(response, trackingOnEvent);
          toolCalls = jsonRes.toolCalls;
          if (jsonRes.threadId) threadId = jsonRes.threadId;
        }
        if (this.lastSeenThreadId) {
          threadId = this.lastSeenThreadId;
          this.lastSeenThreadId = undefined;
        }

        // ── Fallback: model emitted a tool call as a markdown JSON block ──────
        // Granite sometimes skips the native tool_calls API and prints the
        // arguments as ```json ... ``` text. Parse those blocks, validate them
        // against AGENT_TOOLS, and synthesize tool calls so they still execute.
        if ((!toolCalls || toolCalls.length === 0) && opts.executeToolFn && assistantMessageContent) {
          const extraction = extractToolCallsFromText(assistantMessageContent);
          if (extraction.toolCalls.length > 0) {
            toolCalls = extraction.toolCalls;
            assistantMessageContent = extraction.cleanedContent;
            // Re-emit the cleaned content so the chat UI drops the raw JSON block
            opts.onEvent({
              type: 'content_done',
              data: { content: extraction.cleanedContent },
              timestamp: new Date(),
            });
          }
        }

        // ── Flow hijack detection ─────────────────────────────────────────────
        // If the Orchestrate agent has a Flow attached in the platform console,
        // a user utterance can trigger it and lock the conversation with a
        // canned "A new flow has started..." message. Nothing client-side can
        // dismiss it, so surface actionable guidance instead of a dead chat.
        if (/a new flow has started/i.test(assistantMessageContent)) {
          opts.onEvent({
            type: 'agent_error',
            data: {
              error:
                'The Orchestrate agent triggered a platform Flow, which locks this conversation. ' +
                'Detach or disable Flows on this agent in the watsonx Orchestrate console ' +
                '(Agent → Toolset → Flows) so chat requests are answered directly.',
              code: 'ORCHESTRATE_FLOW_HIJACK',
            },
            timestamp: new Date(),
          } as any);
          break;
        }

        // If there are no tool calls, we are done
        if (!toolCalls || toolCalls.length === 0 || !opts.executeToolFn) {
          // The SSE path only emits deltas — close the turn with an explicit
          // content_done so the UI finalizes the streaming bubble.
          if (!contentDoneEmitted) {
            opts.onEvent({
              type: 'content_done',
              data: { content: assistantMessageContent },
              timestamp: new Date(),
            });
          }
          opts.onEvent({
            type: 'status_update',
            data: { status: 'done' },
            timestamp: new Date(),
          } as any);
          break;
        }

        // Execute tools, then send the results back as the next turn.
        // Verified behavior: with X-IBM-THREAD-ID continuity the agent
        // correctly consumes results delivered as plain user text
        // ("[TOOL RESULT for <tool>]: ..."), so that is the format we use.
        const toolResultMessages: any[] = [];
        for (const tc of toolCalls) {
          opts.onEvent({
            type: 'status_update',
            data: { status: 'executing' },
            timestamp: new Date(),
          } as any);
          try {
            const args = JSON.parse(tc.function.arguments);
            opts.onEvent({
              type: 'tool_start',
              data: { toolCallId: tc.id, toolName: tc.function.name, arguments: args },
              timestamp: new Date(),
            } as any);

            const result = await opts.executeToolFn(tc.function.name, args);

            opts.onEvent({
              type: 'tool_end',
              data: { toolCallId: tc.id, toolName: tc.function.name, output: result },
              timestamp: new Date(),
            } as any);

            toolResultMessages.push({
              role: 'user',
              content: `[TOOL RESULT for ${tc.function.name}]: ${result}`,
            });
          } catch (err) {
            const errorResult = `Error: ${String(err)}`;
            opts.onEvent({
              type: 'tool_end',
              data: { toolCallId: tc.id, toolName: tc.function.name, output: errorResult },
              timestamp: new Date(),
            } as any);
            toolResultMessages.push({
              role: 'user',
              content: `[TOOL RESULT for ${tc.function.name}]: ${errorResult}`,
            });
          }
        }
        pendingMessages = toolResultMessages;
      } finally {
        clearTimeout(timeout);
      }
    }

    return { threadId };
  }

  // ── SSE Streaming ──────────────────────────────────────────────────────────

  private async handleSSEStream(
    response: Response,
    onEvent: (event: AgentEvent) => void,
  ): Promise<any[]> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body reader available');

    const decoder = new TextDecoder();
    let buffer = '';
    const toolCallsBuffer = new Map<number, any>();

    onEvent({ type: 'status_update', data: { status: 'thinking' }, timestamp: new Date() });

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const raw = line.slice(6).trim();
            if (!raw || raw === '[DONE]') continue;
            this.parseAndEmit(raw, onEvent, toolCallsBuffer);
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
    
    // Return accumulated tool calls
    const toolCalls = Array.from(toolCallsBuffer.values());
    if (toolCalls.length === 0) {
      onEvent({ type: 'status_update', data: { status: 'done' }, timestamp: new Date() });
    }
    return toolCalls;
  }

  // ── JSON Response ──────────────────────────────────────────────────────────

  private async handleJsonResponse(
    response: Response,
    onEvent: (event: AgentEvent) => void,
  ): Promise<{ toolCalls: any[]; threadId?: string }> {
    const json = await response.json() as Record<string, unknown>;

    // Capture the platform thread id for conversation continuity
    const threadId = typeof json.thread_id === 'string' ? json.thread_id : undefined;

    // Check for tool calls in the JSON response
    const choices = json.choices as any[];
    const toolCalls = choices?.[0]?.message?.tool_calls || [];

    // Extract the text content from common Orchestrate response shapes
    const content =
      (json.output as string) ??
      (json.text as string) ??
      (json.content as string) ??
      (choices?.[0]?.message?.content) ??
      '';

    onEvent({ type: 'status_update', data: { status: 'thinking' }, timestamp: new Date() });

    // Simulate streaming for JSON responses — emit in chunks so the UI animates
    if (content) {
      const chunkSize = 8;
      for (let i = 0; i < content.length; i += chunkSize) {
        const delta = content.slice(i, i + chunkSize);
        onEvent({ type: 'content_delta', data: { delta }, timestamp: new Date() });
        // small artificial delay for streaming effect
        await new Promise((r) => setTimeout(r, 8));
      }
      onEvent({ type: 'content_done', data: { content }, timestamp: new Date() });
    }

    if (toolCalls.length === 0) {
      onEvent({ type: 'status_update', data: { status: 'done' }, timestamp: new Date() });
    }
    return { toolCalls, threadId };
  }

  // ── SSE Event Parser ───────────────────────────────────────────────────────

  private parseAndEmit(raw: string, onEvent: (event: AgentEvent) => void, toolCallsBuffer: Map<number, any>): void {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      // Capture the platform thread id wherever it appears in the stream
      if (typeof parsed.thread_id === 'string') {
        this.lastSeenThreadId = parsed.thread_id;
      }

      // IBM Orchestrate SSE shapes vary — handle the most common ones:

      // Shape 1: { type: 'content_delta', delta: '...' }
      if (parsed.type === 'content_delta' && parsed.delta) {
        onEvent({ type: 'content_delta', data: { delta: parsed.delta as string }, timestamp: new Date() });
        return;
      }

      // Shape 2: { type: 'content_done', content: '...' }
      if (parsed.type === 'content_done' && parsed.content) {
        onEvent({ type: 'content_done', data: { content: parsed.content as string }, timestamp: new Date() });
        return;
      }

      // Shape 3 & 4: { choices: [...] } (OpenAI-compatible)
      const choices = parsed.choices as any[] | undefined;
      if (choices?.length) {
        const delta = choices[0].delta;
        if (delta) {
          if (delta.content) {
            onEvent({ type: 'content_delta', data: { delta: delta.content }, timestamp: new Date() });
          }
          if (delta.tool_calls) {
            for (const tc of delta.tool_calls) {
              const existing = toolCallsBuffer.get(tc.index) || { id: tc.id, type: 'function', function: { name: '', arguments: '' } };
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.function.name = tc.function.name;
              if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
              toolCallsBuffer.set(tc.index, existing);
            }
          }
        }
        return;
      }

      // Shape 5: { object: 'thread.message.delta', delta: { content: [...] } } (Assistant API format fallback)
      if (parsed.object === 'thread.message.delta' && parsed.delta) {
        const contentArr = (parsed.delta as any)?.content;
        if (Array.isArray(contentArr) && contentArr.length > 0) {
          const textVal = contentArr[0]?.text?.value;
          if (typeof textVal === 'string' && textVal.length > 0) {
            onEvent({ type: 'content_delta', data: { delta: textVal }, timestamp: new Date() });
          }
        }
        return;
      }

      // Shape 5: { output: '...', done: true }
      if (parsed.output) {
        const text = parsed.output as string;
        for (let i = 0; i < text.length; i += 8) {
          onEvent({ type: 'content_delta', data: { delta: text.slice(i, i + 8) }, timestamp: new Date() });
        }
        onEvent({ type: 'content_done', data: { content: text }, timestamp: new Date() });
        return;
      }

      // Shape 5: { text: '...' }
      if (typeof parsed.text === 'string') {
        onEvent({ type: 'content_delta', data: { delta: parsed.text }, timestamp: new Date() });
        return;
      }

      // Shape 6: status events
      if (parsed.type === 'status' || parsed.status) {
        const rawStatus = String(parsed.status ?? parsed.type);
        const VALID_STATUSES = ['idle', 'thinking', 'executing', 'waiting', 'done', 'error'] as const;
        type AgentStatusUnion = typeof VALID_STATUSES[number];
        const status: AgentStatusUnion = (VALID_STATUSES as readonly string[]).includes(rawStatus)
          ? rawStatus as AgentStatusUnion
          : 'thinking';
        onEvent({ type: 'status_update', data: { status }, timestamp: new Date() });
        return;
      }
    } catch {
      // Non-JSON SSE line — skip silently
    }
  }

  /** Test connectivity to the Orchestrate endpoint */
  async ping(): Promise<boolean> {
    try {
      const r = await fetch(this.config.agentUrl.replace(/\/run$/, '/health'), {
        method: 'GET',
        headers: this.authHeaders,
        signal: AbortSignal.timeout(5000),
      });
      return r.ok;
    } catch {
      return false;
    }
  }
}
