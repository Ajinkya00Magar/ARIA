import { createConsoleLogger, generateId } from '@ibm-agent/shared';
import type { AgentEvent, ToolCall } from '@ibm-agent/types';

const logger = createConsoleLogger('info');

export interface CloudProxyRunOptions {
  chatHistory: any[];
  userMessage: string;
  projectSummary: any;
  workspaceId: string;
  token?: string;
  proxyUrl: string;
  isContinuation?: boolean;
  onEvent: (event: AgentEvent) => void;
}

export interface CloudProxyResult {
  content: string;
  toolCalls?: ToolCall[];
}

export class CloudProxyClient {
  async run(opts: CloudProxyRunOptions): Promise<CloudProxyResult> {
    logger.info(`🌐 Forwarding LLM run to Cloud Proxy: ${opts.proxyUrl}`);

    const response = await fetch(opts.proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(opts.token ? { Authorization: opts.token } : {}),
      },
      body: JSON.stringify({
        chatHistory: opts.chatHistory,
        content: opts.userMessage,
        projectSummary: opts.projectSummary,
        workspaceId: opts.workspaceId,
        isContinuation: opts.isContinuation,
      }),
    });

    if (!response.ok) {
      throw new Error(`Cloud Proxy Error: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('Cloud Proxy returned no body');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    
    let content = '';
    let toolCalls: ToolCall[] | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const dataStr = line.slice(6);
          if (dataStr === '[DONE]') continue;
          try {
            const eventData = JSON.parse(dataStr);
            
            if (eventData.type === 'tool_call_request') {
               toolCalls = eventData.data.toolCalls;
               // DO NOT forward tool_call_request to frontend, because the local backend will handle it!
            } else if (eventData.type === 'content_done') {
               content = eventData.data.content;
               opts.onEvent(eventData as AgentEvent);
            } else if (eventData.type === 'stream_end') {
               // Do not forward stream_end yet, we might loop!
            } else {
               opts.onEvent(eventData as AgentEvent);
            }
          } catch (e) {
            // Ignore parse errors for partial chunks
          }
        }
      }
    }
    
    return { content, toolCalls };
  }
}

