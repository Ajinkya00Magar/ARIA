// ─────────────────────────────────────────────────────────────────────────────
// IBM watsonx Orchestrate Client
// Primary agent execution layer for ARIA
// ─────────────────────────────────────────────────────────────────────────────

import type { AgentEvent, ToolCall } from '@ibm-agent/types';
import { AGENT_TOOLS } from '@ibm-agent/ai';

export interface OrchestrateMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  name?: string;
  tool_calls?: unknown[];
  tool_call_id?: string;
}

export interface OrchestrateRunOptions {
  userMessage: string;
  chatHistory: OrchestrateMessage[];
  workspaceId?: string;
  systemPrompt?: string;
  runId?: string;
  onEvent: (event: AgentEvent) => void;
  executeToolFn?: (toolName: string, args: Record<string, unknown>) => Promise<string>;
  requestPermissionFn?: (action: string, description: string, details: Record<string, unknown>) => Promise<boolean>;
}

export interface OrchestrateConfig {
  agentUrl: string;
  apiKey: string;
  bearerToken?: string;
  timeoutMs?: number;
}

/**
 * IBM watsonx Orchestrate Agent Client — ARIA's primary intelligence layer
 *
 * Handles:
 *   • IAM token acquisition and refresh
 *   • SSE streaming (text/event-stream)
 *   • JSON REST fallback (application/json)
 *   • Tool call execution loop (IBM Orchestrate requests → local tool execution)
 *   • Structured error mapping
 */
export class OrchestrateClient {
  private config: Required<OrchestrateConfig>;
  private tokenExpiresAt: number = 0;

  constructor(config: OrchestrateConfig) {
    this.config = {
      agentUrl: config.agentUrl,
      apiKey: config.apiKey,
      bearerToken: config.bearerToken ?? '',
      timeoutMs: config.timeoutMs ?? 120_000,
    };
  }

  // ── IAM Token Management ────────────────────────────────────────────────────

  private async refreshIamToken(): Promise<void> {
    if (!this.config.apiKey) return;
    // Skip if token is still valid (5 min buffer)
    if (this.config.bearerToken && Date.now() < this.tokenExpiresAt - 300_000) return;

    const iamRes = await fetch('https://iam.cloud.ibm.com/identity/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${this.config.apiKey}`,
      signal: AbortSignal.timeout(10_000),
    });

    if (!iamRes.ok) {
      const text = await iamRes.text().catch(() => iamRes.statusText);
      throw new Error(`IBM_AUTH_ERROR: IAM token acquisition failed (${iamRes.status}): ${text}`);
    }

    const data = (await iamRes.json()) as { access_token: string; expires_in: number };
    this.config.bearerToken = data.access_token;
    this.tokenExpiresAt = Date.now() + data.expires_in * 1000;
  }

  private get authHeaders(): Record<string, string> {
    if (this.config.bearerToken) {
      return { Authorization: `Bearer ${this.config.bearerToken}` };
    }
    // Fallback: treat apiKey as a bare bearer token (some Orchestrate setups)
    return { Authorization: `Bearer ${this.config.apiKey}` };
  }

  // ── Main Agent Loop ─────────────────────────────────────────────────────────

  async run(opts: OrchestrateRunOptions): Promise<void> {
    const runId = opts.runId ?? 'run-' + Date.now();

    // Acquire / refresh IAM token
    try {
      await this.refreshIamToken();
    } catch (err) {
      opts.onEvent({
        type: 'agent_error',
        data: { error: String(err), code: 'IBM_AUTH_ERROR' },
        timestamp: new Date(),
      });
      throw err;
    }

    let iterations = 0;
    const maxIterations = 30;
    const chatHistory = [...opts.chatHistory];

    // Convert ARIA tool definitions to OpenAI-compatible function format
    const tools = opts.executeToolFn
      ? AGENT_TOOLS.map((t) => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }))
      : [];

    chatHistory.push({ role: 'user', content: opts.userMessage });

    opts.onEvent({
      type: 'status_update',
      data: { status: 'thinking', message: 'Connecting to IBM watsonx Orchestrate…' },
      timestamp: new Date(),
    });

    while (iterations < maxIterations) {
      iterations++;

      const rawMessages = [
        ...(opts.systemPrompt ? [{ role: 'system', content: opts.systemPrompt }] : []),
        ...chatHistory,
      ];

      const body: Record<string, unknown> = {
        messages: cleanMessages(rawMessages as OrchestrateMessage[]),
        stream: true,
      };

      if (tools.length > 0) {
        body.tools = tools;
        body.tool_choice = 'auto';
      }

      const controller = new AbortController();
      const timeoutHandle = setTimeout(() => {
        controller.abort();
      }, this.config.timeoutMs);

      let toolCalls: ToolCallAccumulator[] = [];
      let assistantContent = '';

      try {
        const response = await fetch(this.config.agentUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream, application/json',
            'X-Request-ID': runId,
            ...this.authHeaders,
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!response.ok) {
          const errText = await response.text().catch(() => response.statusText);
          const code = mapHttpErrorCode(response.status);
          opts.onEvent({
            type: 'agent_error',
            data: { error: `Orchestrate: ${errText}`, code },
            timestamp: new Date(),
          });
          throw new Error(`${code}: HTTP ${response.status}: ${errText}`);
        }

        const contentType = response.headers.get('content-type') ?? '';

        const trackEvent = (event: AgentEvent) => {
          opts.onEvent(event);
          if (event.type === 'content_delta') {
            assistantContent += (event.data as { delta: string }).delta;
          } else if (event.type === 'content_done') {
            assistantContent = (event.data as { content: string }).content || assistantContent;
          }
        };

        if (contentType.includes('text/event-stream')) {
          toolCalls = await this.handleSSEStream(response, trackEvent);
        } else {
          const result = await this.handleJsonResponse(response, trackEvent);
          toolCalls = result.toolCalls;
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') {
          opts.onEvent({
            type: 'agent_error',
            data: { error: 'Request timed out', code: 'IBM_TIMEOUT' },
            timestamp: new Date(),
          });
        }
        throw err;
      } finally {
        clearTimeout(timeoutHandle);
      }

      // No tool calls → agent has finished responding
      if (!toolCalls.length || !opts.executeToolFn) {
        opts.onEvent({
          type: 'status_update',
          data: { status: 'done' },
          timestamp: new Date(),
        });
        break;
      }

      // Add assistant message with tool calls to conversation
      chatHistory.push({
        role: 'assistant',
        content: assistantContent,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
      });

      // Execute each tool call locally
      for (const tc of toolCalls) {
        const callId = tc.id || generateCallId();

        opts.onEvent({
          type: 'tool_start',
          data: {
            toolCallId: callId,
            toolName: tc.name as never,
            arguments: tc.args,
          },
          timestamp: new Date(),
        });

        opts.onEvent({
          type: 'status_update',
          data: { status: 'executing', message: `Running ${tc.name}…` },
          timestamp: new Date(),
        });

        const startMs = Date.now();
        let output = '';

        try {
          output = await opts.executeToolFn(tc.name, tc.args);
        } catch (err) {
          output = `Error executing ${tc.name}: ${String(err)}`;
          opts.onEvent({
            type: 'tool_error',
            data: { toolCallId: callId, toolName: tc.name as never, error: String(err) },
            timestamp: new Date(),
          });
        }

        const duration = Date.now() - startMs;

        opts.onEvent({
          type: 'tool_end',
          data: {
            toolCallId: callId,
            toolName: tc.name as never,
            output: output.slice(0, 4000),
            duration,
          },
          timestamp: new Date(),
        });

        chatHistory.push({
          role: 'tool',
          tool_call_id: callId,
          name: tc.name,
          content: output.slice(0, 8000), // truncate to avoid context explosion
        });

        opts.onEvent({
          type: 'status_update',
          data: { status: 'thinking', message: 'Processing results…' },
          timestamp: new Date(),
        });
      }
    }
  }

  // ── SSE Streaming ───────────────────────────────────────────────────────────

  private async handleSSEStream(
    response: Response,
    onEvent: (event: AgentEvent) => void,
  ): Promise<ToolCallAccumulator[]> {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('IBM_STREAM_ERROR: No response body reader');

    const decoder = new TextDecoder();
    let buffer = '';
    const toolBuffer = new Map<number, ToolCallAccumulator>();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw || raw === '[DONE]') continue;
          this.parseSSEChunk(raw, onEvent, toolBuffer);
        }
      }
    } finally {
      reader.releaseLock();
    }

    const toolCalls = Array.from(toolBuffer.values());
    if (toolCalls.length === 0) {
      onEvent({ type: 'content_done', data: { content: '' }, timestamp: new Date() });
    }
    return toolCalls;
  }

  // ── JSON Response ────────────────────────────────────────────────────────────

  private async handleJsonResponse(
    response: Response,
    onEvent: (event: AgentEvent) => void,
  ): Promise<{ toolCalls: ToolCallAccumulator[] }> {
    const json = (await response.json()) as Record<string, unknown>;
    const choices = json.choices as Array<{ message: { content?: string; tool_calls?: unknown[] } }> | undefined;
    const toolCallsRaw = choices?.[0]?.message?.tool_calls ?? [];

    const content =
      (json.output as string) ??
      (json.text as string) ??
      (json.content as string) ??
      choices?.[0]?.message?.content ??
      '';

    if (content) {
      // Stream content in chunks for smooth UI
      const chunkSize = 12;
      for (let i = 0; i < content.length; i += chunkSize) {
        onEvent({
          type: 'content_delta',
          data: { delta: content.slice(i, i + chunkSize) },
          timestamp: new Date(),
        });
        await sleep(6);
      }
      onEvent({ type: 'content_done', data: { content }, timestamp: new Date() });
    }

    const toolCalls: ToolCallAccumulator[] = (toolCallsRaw as Array<{
      id?: string;
      function?: { name?: string; arguments?: string };
    }>).map((tc) => {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function?.arguments ?? '{}') as Record<string, unknown>;
      } catch {}
      return { id: tc.id ?? generateCallId(), name: tc.function?.name ?? '', args };
    });

    return { toolCalls };
  }

  // ── SSE Chunk Parser ─────────────────────────────────────────────────────────

  private parseSSEChunk(
    raw: string,
    onEvent: (event: AgentEvent) => void,
    toolBuffer: Map<number, ToolCallAccumulator>,
  ): void {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;

      // Native IBM Orchestrate delta format
      if (parsed.type === 'content_delta') {
        onEvent({
          type: 'content_delta',
          data: { delta: parsed.delta as string },
          timestamp: new Date(),
        });
        return;
      }

      if (parsed.type === 'content_done') {
        onEvent({
          type: 'content_done',
          data: { content: parsed.content as string },
          timestamp: new Date(),
        });
        return;
      }

      // OpenAI-compatible choices format (most common)
      const choices = parsed.choices as Array<{
        delta?: { content?: string; tool_calls?: Array<{
          index: number; id?: string;
          function?: { name?: string; arguments?: string };
        }>};
        finish_reason?: string;
      }> | undefined;

      if (choices?.length) {
        const delta = choices[0].delta;
        if (delta?.content) {
          onEvent({
            type: 'content_delta',
            data: { delta: delta.content },
            timestamp: new Date(),
          });
        }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const existing = toolBuffer.get(tc.index) ?? {
              id: tc.id ?? '',
              name: '',
              args: {},
              _argsStr: '',
            };
            if (tc.id) existing.id = tc.id;
            if (tc.function?.name) existing.name = tc.function.name;
            if (tc.function?.arguments) existing._argsStr = (existing._argsStr ?? '') + tc.function.arguments;
            toolBuffer.set(tc.index, existing);
          }
        }
        if (choices[0].finish_reason === 'stop' || choices[0].finish_reason === 'tool_calls') {
          // Finalize tool call args from accumulated strings
          for (const [idx, tc] of toolBuffer.entries()) {
            if (tc._argsStr && !Object.keys(tc.args).length) {
              try {
                tc.args = JSON.parse(tc._argsStr) as Record<string, unknown>;
              } catch {
                tc.args = {};
              }
            }
            toolBuffer.set(idx, tc);
          }
        }
        return;
      }

      // IBM Thread API format
      if (parsed.object === 'thread.message.delta') {
        const contentArr = (parsed.delta as { content?: Array<{ text?: { value?: string } }> })?.content;
        if (Array.isArray(contentArr) && contentArr[0]?.text?.value) {
          onEvent({
            type: 'content_delta',
            data: { delta: contentArr[0].text.value },
            timestamp: new Date(),
          });
        }
        return;
      }

      // Legacy text/output shapes
      if (parsed.output) {
        const text = parsed.output as string;
        for (let i = 0; i < text.length; i += 12) {
          onEvent({
            type: 'content_delta',
            data: { delta: text.slice(i, i + 12) },
            timestamp: new Date(),
          });
        }
        onEvent({ type: 'content_done', data: { content: text }, timestamp: new Date() });
        return;
      }

      if (typeof parsed.text === 'string') {
        onEvent({
          type: 'content_delta',
          data: { delta: parsed.text },
          timestamp: new Date(),
        });
        return;
      }
    } catch {
      // Non-JSON SSE lines are normal (comments, keep-alives)
    }
  }

  // ── Health Check ─────────────────────────────────────────────────────────────

  async ping(): Promise<boolean> {
    try {
      const healthUrl = this.config.agentUrl.replace(/\/chat\/completions$/, '/health').replace(/\/run$/, '/health');
      const r = await fetch(healthUrl, {
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

// ── Helpers ────────────────────────────────────────────────────────────────────

interface ToolCallAccumulator {
  id: string;
  name: string;
  args: Record<string, unknown>;
  _argsStr?: string;
}

function cleanMessages(msgs: OrchestrateMessage[]): OrchestrateMessage[] {
  const result: OrchestrateMessage[] = [];
  for (const msg of msgs) {
    const prev = result[result.length - 1];
    if (prev && prev.role === msg.role && msg.role !== 'tool') {
      prev.content = (prev.content || '') + '\n\n' + (msg.content || '');
      if (msg.tool_calls) {
        prev.tool_calls = [...(prev.tool_calls ?? []), ...msg.tool_calls];
      }
    } else {
      result.push({ ...msg });
    }
  }
  return result;
}

function generateCallId(): string {
  return 'call_' + Math.random().toString(36).slice(2, 11);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function mapHttpErrorCode(status: number): string {
  if (status === 401 || status === 403) return 'IBM_AUTH_ERROR';
  if (status === 429) return 'IBM_RATE_LIMITED';
  if (status === 503 || status === 502) return 'IBM_SERVICE_UNAVAILABLE';
  if (status === 408 || status === 504) return 'IBM_TIMEOUT';
  return 'IBM_REQUEST_ERROR';
}
