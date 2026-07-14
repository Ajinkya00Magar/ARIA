// ─────────────────────────────────────────────────────────────────────────────
// IBM watsonx.ai Client
// Handles IAM token refresh, chat completions, and streaming
// ─────────────────────────────────────────────────────────────────────────────

import axios, { AxiosInstance } from 'axios';
import { createParser } from 'eventsource-parser';
import type {
  WatsonxConfig,
  WatsonxMessage,
  WatsonxToolCall,
  ToolDefinition,
} from '@ibm-agent/types';
import { ExternalServiceError } from '@ibm-agent/shared';
import { IBM_IAM_TOKEN_URL } from '@ibm-agent/shared';

interface IamTokenResponse {
  access_token: string;
  expiration: number;
  token_type: string;
}

interface WatsonxChatRequest {
  model_id: string;
  messages: any[];
  tools?: WatsonxToolSpec[];
  tool_choice?: 'auto' | 'none' | { type: 'function'; function: { name: string } };
  parameters?: {
    temperature?: number;
    max_new_tokens?: number;
    top_p?: number;
    top_k?: number;
    stop_sequences?: string[];
    repetition_penalty?: number;
  };
  project_id: string;
  stream?: boolean;
}

interface WatsonxToolSpec {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

interface WatsonxChatResponse {
  id: string;
  created: number;
  model_id: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: WatsonxToolCall[];
    };
    finish_reason: 'stop' | 'tool_calls' | 'length' | 'max_tokens';
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface WatsonxStreamChunk {
  id: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason?: string | null;
  }>;
}

export class WatsonxClient {
  private readonly config: WatsonxConfig;
  private readonly http: AxiosInstance;
  private iamToken: string | null = null;
  private iamTokenExpiry = 0;

  constructor(config: WatsonxConfig) {
    this.config = config;
    this.http = axios.create({
      baseURL: config.baseUrl,
      timeout: 120_000,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ── IAM Token Management ─────────────────────────────────────────────────────

  private async getIamToken(): Promise<string> {
    const now = Date.now() / 1000;
    if (this.iamToken && this.iamTokenExpiry > now + 60) {
      return this.iamToken;
    }

    try {
      const response = await axios.post<IamTokenResponse>(
        IBM_IAM_TOKEN_URL,
        new URLSearchParams({
          grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
          apikey: this.config.apiKey,
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: 30_000,
        },
      );
      this.iamToken = response.data.access_token;
      this.iamTokenExpiry = response.data.expiration;
      return this.iamToken;
    } catch (err) {
      throw new ExternalServiceError('IBM IAM', `Failed to obtain IAM token: ${String(err)}`);
    }
  }

  private async getAuthHeaders(): Promise<Record<string, string>> {
    const token = await this.getIamToken();
    return { Authorization: `Bearer ${token}` };
  }

  private mapMessageToApi(msg: WatsonxMessage): any {
    const apiMsg: any = {
      role: msg.role,
      content: msg.content,
    };
    if (msg.name) {
      apiMsg.name = msg.name;
    }
    if (msg.toolCallId) {
      apiMsg.tool_call_id = msg.toolCallId;
    }
    if (msg.toolCalls && msg.toolCalls.length > 0) {
      apiMsg.tool_calls = msg.toolCalls.map((tc) => ({
        id: tc.id,
        type: tc.type,
        function: {
          name: tc.function.name,
          arguments: tc.function.arguments,
        },
      }));
    }
    return apiMsg;
  }

  // ── Non-streaming Chat ────────────────────────────────────────────────────────

  async chat(
    messages: WatsonxMessage[],
    tools?: ToolDefinition[],
    options?: Partial<WatsonxConfig['parameters']>,
  ): Promise<WatsonxChatResponse> {
    const authHeaders = await this.getAuthHeaders();
    const body: WatsonxChatRequest = {
      model_id: this.config.modelId,
      project_id: this.config.projectId,
      messages: messages.map((msg) => this.mapMessageToApi(msg)),
      parameters: {
        temperature: options?.temperature ?? this.config.parameters?.temperature ?? 0.2,
        max_new_tokens: options?.maxNewTokens ?? this.config.parameters?.maxNewTokens ?? 4096,
        top_p: options?.topP ?? this.config.parameters?.topP ?? 0.95,
      },
    };

    if (tools && tools.length > 0) {
      body.tools = tools.map(this.toWatsonxTool);
      body.tool_choice = 'auto';
    }

    try {
      const response = await this.http.post<WatsonxChatResponse>(
        '/ml/v1/text/chat?version=2024-05-31',
        body,
        { headers: authHeaders },
      );
      return response.data;
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const msg = err.response?.data?.errors?.[0]?.message ?? err.message;
        throw new ExternalServiceError('watsonx.ai', msg);
      }
      throw new ExternalServiceError('watsonx.ai', String(err));
    }
  }

  // ── Streaming Chat ────────────────────────────────────────────────────────────

  async *chatStream(
    messages: WatsonxMessage[],
    tools?: ToolDefinition[],
    options?: Partial<WatsonxConfig['parameters']>,
  ): AsyncGenerator<WatsonxStreamChunk> {
    const authHeaders = await this.getAuthHeaders();
    const body: WatsonxChatRequest = {
      model_id: this.config.modelId,
      project_id: this.config.projectId,
      messages: messages.map((msg) => this.mapMessageToApi(msg)),
      stream: true,
      parameters: {
        temperature: options?.temperature ?? this.config.parameters?.temperature ?? 0.2,
        max_new_tokens: options?.maxNewTokens ?? this.config.parameters?.maxNewTokens ?? 4096,
        top_p: options?.topP ?? 0.95,
      },
    };

    if (tools && tools.length > 0) {
      body.tools = tools.map(this.toWatsonxTool);
      body.tool_choice = 'auto';
    }

    let response;
    try {
      response = await this.http.post('/ml/v1/text/chat_stream?version=2024-05-31', body, {
        headers: { ...authHeaders, Accept: 'text/event-stream' },
        responseType: 'stream',
      });
    } catch (err: any) {
      if (axios.isAxiosError(err)) {
        let errorData = '';
        const responseData = err.response?.data;
        if (responseData) {
          if (typeof responseData.on === 'function') {
            errorData = await new Promise<string>((resolve) => {
              let chunk = '';
              responseData.on('data', (d: Buffer) => { chunk += d.toString(); });
              responseData.on('end', () => resolve(chunk));
              responseData.on('error', () => resolve(''));
            });
          } else {
            errorData = typeof responseData === 'string' ? responseData : JSON.stringify(responseData);
          }
        }
        const errorMsg = errorData || err.message;
        console.error("Watsonx stream post error:", errorMsg);
        throw new Error(`Watsonx stream failed: ${errorMsg}`);
      }
      throw err;
    }

    const stream = response.data as NodeJS.ReadableStream;
    const queue: WatsonxStreamChunk[] = [];
    let resolve: (() => void) | null = null;
    let done = false;
    let error: Error | null = null;

    const parser = createParser((event) => {
      if (event.type !== 'event') return;
      if (event.data === '[DONE]') {
        done = true;
        resolve?.();
        return;
      }
      try {
        const chunk = JSON.parse(event.data) as WatsonxStreamChunk;
        queue.push(chunk);
        resolve?.();
      } catch {
        // ignore parse errors on metadata lines
      }
    });

    stream.on('data', (chunk: Buffer) => {
      parser.feed(chunk.toString());
    });

    stream.on('end', () => {
      done = true;
      resolve?.();
    });

    stream.on('error', (err) => {
      error = err;
      resolve?.();
    });

    while (!done || queue.length > 0) {
      if (queue.length > 0) {
        yield queue.shift()!;
      } else if (!done) {
        await new Promise<void>((r) => {
          resolve = r;
        });
        resolve = null;
      }
    }

    if (error) {
      throw new ExternalServiceError('watsonx.ai stream', (error as Error).message ?? String(error));
    }
  }

  // ── Embeddings ─────────────────────────────────────────────────────────────────

  async embed(texts: string[]): Promise<number[][]> {
    const authHeaders = await this.getAuthHeaders();
    try {
      const response = await this.http.post<{
        results: Array<{ embedding: number[] }>;
      }>(
        '/ml/v1/text/embeddings?version=2024-05-31',
        {
          model_id: 'ibm/slate-30m-english-rtrvr',
          inputs: texts,
          project_id: this.config.projectId,
        },
        { headers: authHeaders },
      );
      return response.data.results.map((r) => r.embedding);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        throw new ExternalServiceError('watsonx.ai embeddings', err.response?.data?.errors?.[0]?.message ?? err.message);
      }
      throw new ExternalServiceError('watsonx.ai embeddings', String(err));
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────────

  private toWatsonxTool(tool: ToolDefinition): WatsonxToolSpec {
    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters as Record<string, unknown>,
      },
    };
  }

  // Expose model id for logging
  get modelId(): string {
    return this.config.modelId;
  }
}
