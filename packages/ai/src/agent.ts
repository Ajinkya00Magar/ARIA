// ─────────────────────────────────────────────────────────────────────────────
// IBM Coding Agent — Core Agent Loop
// Implements: Plan → Decompose → Tool Selection → Execute → Observe → Repeat
// ─────────────────────────────────────────────────────────────────────────────

import {
  AgentEvent,
  AgentEventType,
  AgentStatus,
  ChatMessage,
  Memory,
  ProjectSummary,
  ToolCall,
  ToolName,
  ToolResult,
  WatsonxMessage,
} from '@ibm-agent/types';
import { AgentError, generateId, sleep, MAX_RETRIES } from '@ibm-agent/shared';
import { WatsonxClient } from './watsonx-client';
import { AGENT_TOOLS } from './tools';
import { buildSystemPrompt } from './prompts';

export type ToolExecutorFn = (
  toolName: ToolName,
  args: Record<string, unknown>,
  workspaceId: string,
) => Promise<string>;

export type PermissionRequestFn = (
  action: string,
  description: string,
  details: Record<string, unknown>,
) => Promise<boolean>;

export interface AgentRunOptions {
  workspaceId: string;
  userId: string;
  chatHistory: ChatMessage[];
  userMessage: string;
  projectSummary?: ProjectSummary | null;
  memories?: Memory[];
  temperature?: number;
  maxTokens?: number;
  maxIterations?: number;
  onEvent: (event: AgentEvent) => void;
  executeToolFn: ToolExecutorFn;
  requestPermissionFn: PermissionRequestFn;
}

const DESTRUCTIVE_TOOLS: ToolName[] = ['delete_file', 'git_push'];
const MAX_TOOL_ITERATIONS = 30;

function emit(onEvent: (e: AgentEvent) => void, type: AgentEventType, data: AgentEvent['data']) {
  onEvent({ type, id: generateId(), data, timestamp: new Date() });
}

function cleanMessages(messages: WatsonxMessage[]): WatsonxMessage[] {
  const result: WatsonxMessage[] = [];
  for (const msg of messages) {
    const prev = result[result.length - 1];
    if (prev && prev.role === msg.role && msg.role !== 'tool') {
      prev.content = (prev.content || '') + '\n\n' + (msg.content || '');
      if (msg.toolCalls) {
        prev.toolCalls = [...(prev.toolCalls || []), ...msg.toolCalls];
      }
    } else {
      result.push({ ...msg });
    }
  }
  return result;
}

export class CodingAgent {
  constructor(private readonly watsonx: WatsonxClient) {}

  async run(opts: AgentRunOptions): Promise<string> {
    const {
      workspaceId,
      chatHistory,
      userMessage,
      projectSummary,
      memories,
      temperature,
      maxTokens,
      maxIterations = MAX_TOOL_ITERATIONS,
      onEvent,
      executeToolFn,
      requestPermissionFn,
    } = opts;

    emit(onEvent, 'status_update', { status: 'thinking' as AgentStatus, message: 'Agent started' });

    // Build conversation messages for watsonx
    const systemPrompt = buildSystemPrompt(projectSummary, memories);

    const rawMessages: WatsonxMessage[] = [
      { role: 'system', content: systemPrompt },
      ...chatHistory.slice(-20).map((m): WatsonxMessage => ({
        role: m.role === 'tool' ? 'tool' : (m.role as WatsonxMessage['role']),
        content: m.content,
        toolCalls: m.toolCalls as never,
      })),
      { role: 'user', content: userMessage },
    ];

    const messages = cleanMessages(rawMessages);

    let iteration = 0;
    let finalContent = '';

    while (iteration < maxIterations) {
      iteration++;

      emit(onEvent, 'status_update', {
        status: 'thinking' as AgentStatus,
        message: `Iteration ${iteration}`,
      });

      let contentBuffer = '';
      const toolCallsBuffer: Map<
        number,
        { id: string; name: string; argumentsStr: string }
      > = new Map();

      // Stream response from watsonx
      let finishReason: string | null | undefined = null;

      try {
        for await (const chunk of this.watsonx.chatStream(messages, AGENT_TOOLS, {
          temperature,
          maxNewTokens: maxTokens,
        })) {
          const choice = chunk.choices[0];
          if (!choice) continue;

          finishReason = choice.finish_reason;

          // Handle text delta
          if (choice.delta.content) {
            contentBuffer += choice.delta.content;
            emit(onEvent, 'content_delta', { delta: choice.delta.content });
          }

          // Accumulate tool calls
          if (choice.delta.tool_calls) {
            for (const tc of choice.delta.tool_calls) {
              const existing = toolCallsBuffer.get(tc.index) ?? {
                id: tc.id ?? '',
                name: tc.function?.name ?? '',
                argumentsStr: '',
              };
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name = tc.function.name;
              if (tc.function?.arguments) existing.argumentsStr += tc.function.arguments;
              toolCallsBuffer.set(tc.index, existing);
            }
          }
        }
      } catch (err) {
        emit(onEvent, 'agent_error', { error: String(err), code: 'STREAM_ERROR' });
        throw new AgentError(`Streaming failed: ${String(err)}`);
      }

      // If no tool calls — agent is done
      if (
        toolCallsBuffer.size === 0 ||
        finishReason === 'stop' ||
        finishReason === 'max_tokens'
      ) {
        finalContent = contentBuffer;
        emit(onEvent, 'content_done', { content: finalContent });
        emit(onEvent, 'agent_done', { summary: finalContent });
        emit(onEvent, 'status_update', { status: 'done' as AgentStatus });
        return finalContent;
      }

      // We have tool calls — process them
      if (contentBuffer) {
        emit(onEvent, 'thinking', { text: contentBuffer });
      }

      // Add assistant message with tool calls to history
      const parsedToolCalls: ToolCall[] = Array.from(toolCallsBuffer.values()).map((tc) => {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(tc.argumentsStr) as Record<string, unknown>;
        } catch {
          args = {};
        }
        return { id: tc.id || generateId(), name: tc.name as ToolName, arguments: args };
      });

      messages.push({
        role: 'assistant',
        content: contentBuffer || '',
        toolCalls: parsedToolCalls.map((tc) => ({
          id: tc.id,
          type: 'function' as const,
          function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
        })),
      });

      // Execute all tool calls and collect results
      const toolResults: ToolResult[] = [];

      for (const toolCall of parsedToolCalls) {
        emit(onEvent, 'tool_start', {
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          arguments: toolCall.arguments,
        });

        // Check if destructive and requires permission
        if (DESTRUCTIVE_TOOLS.includes(toolCall.name)) {
          const approved = await requestPermissionFn(
            toolCall.name,
            `Execute destructive tool: ${toolCall.name}`,
            toolCall.arguments,
          );
          if (!approved) {
            const deniedMsg = `User denied permission for: ${toolCall.name}`;
            toolResults.push({
              toolCallId: toolCall.id,
              name: toolCall.name,
              output: deniedMsg,
              error: deniedMsg,
            });
            emit(onEvent, 'tool_end', {
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              output: deniedMsg,
              duration: 0,
            });
            continue;
          }
        }

        const startMs = Date.now();
        let output = '';
        let toolError: string | undefined;

        let retries = 0;
        while (retries <= MAX_RETRIES) {
          try {
            output = await executeToolFn(toolCall.name, toolCall.arguments, workspaceId);
            break;
          } catch (err) {
            retries++;
            if (retries > MAX_RETRIES) {
              toolError = String(err);
              output = `Error: ${toolError}`;
              emit(onEvent, 'tool_error', {
                toolCallId: toolCall.id,
                toolName: toolCall.name,
                error: toolError,
              });
              break;
            }
            await sleep(1000 * retries);
          }
        }

        const duration = Date.now() - startMs;
        toolResults.push({ toolCallId: toolCall.id, name: toolCall.name, output, error: toolError, duration });

        emit(onEvent, 'tool_end', {
          toolCallId: toolCall.id,
          toolName: toolCall.name,
          output: output.slice(0, 2000), // truncate for event
          duration,
        });
      }

      // Add tool results to message history
      for (const result of toolResults) {
        messages.push({
          role: 'tool',
          content: result.output,
          toolCallId: result.toolCallId,
          name: result.name,
        });
      }
    }

    // Hit max iterations
    emit(onEvent, 'agent_error', { error: 'Max iterations reached', code: 'MAX_ITERATIONS' });
    throw new AgentError('Agent reached maximum number of iterations');
  }
}
