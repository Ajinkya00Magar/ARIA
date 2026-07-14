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
  onEvent: (event: AgentEvent) => void;
  executeToolFn?: (toolName: any, args: any) => Promise<string>;
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
    const iamRes = await fetch("https://iam.cloud.ibm.com/identity/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${this.config.apiKey}`
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
   */
  async run(opts: OrchestrateRunOptions): Promise<void> {
    if (!this.config.bearerToken && this.config.apiKey) {
      this.config.bearerToken = await this.getIamToken();
    }

    let iterations = 0;
    const maxIterations = 30;

    const chatHistory = [...opts.chatHistory];
    
    // Convert AgentTools to OpenAI function tools
    const tools = AGENT_TOOLS.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      }
    }));

    // Start with the initial user message if not already in history
    chatHistory.push({ role: 'user', content: opts.userMessage });

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
        ...(opts.systemPrompt
          ? [{ role: 'system', content: opts.systemPrompt }]
          : []),
        ...chatHistory,
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

        const trackingOnEvent = (event: AgentEvent) => {
          opts.onEvent(event);
          if (event.type === 'content_delta') {
            assistantMessageContent += (event.data as any).delta;
          } else if (event.type === 'content_done') {
            assistantMessageContent = (event.data as any).content || assistantMessageContent;
          }
        };

        if (contentType.includes('text/event-stream')) {
          toolCalls = await this.handleSSEStream(response, trackingOnEvent);
        } else {
          const jsonRes = await this.handleJsonResponse(response, trackingOnEvent);
          toolCalls = jsonRes.toolCalls;
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

        // If there are no tool calls, we are done
        if (!toolCalls || toolCalls.length === 0 || !opts.executeToolFn) {
          break;
        }

        // Add assistant's message with tool calls to history
        chatHistory.push({
          role: 'assistant',
          content: assistantMessageContent,
          tool_calls: toolCalls,
        });

        // Execute tools
        for (const tc of toolCalls) {
          try {
            const args = JSON.parse(tc.function.arguments);
            const result = await opts.executeToolFn(tc.function.name, args);
            chatHistory.push({
              role: 'tool',
              tool_call_id: tc.id,
              name: tc.function.name,
              content: result,
            });
          } catch (err) {
            chatHistory.push({
              role: 'tool',
              tool_call_id: tc.id,
              name: tc.function.name,
              content: `Error: ${String(err)}`,
            });
          }
        }
      } finally {
        clearTimeout(timeout);
      }
    }
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
  ): Promise<{ toolCalls: any[] }> {
    const json = await response.json() as Record<string, unknown>;

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
    return { toolCalls };
  }

  // ── SSE Event Parser ───────────────────────────────────────────────────────

  private parseAndEmit(raw: string, onEvent: (event: AgentEvent) => void, toolCallsBuffer: Map<number, any>): void {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;

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
