import { useState, useCallback, useRef } from 'react';
import type { AgentEvent } from '@ibm-agent/types';

// Let's use apiClient if it handles SSE, but fetch is better for SSE reading the stream.

export function useAgentStream() {
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const stream = useCallback(async (
    params: { chatId: string; content: string; workspaceId: string },
    onEvent: (event: AgentEvent) => void
  ): Promise<string | void> => {
    setIsStreaming(true);
    abortControllerRef.current = new AbortController();

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'production' ? 'http://127.0.0.1:3001/api' : 'http://127.0.0.1:3002/api');

    try {
      let token = '';
      try {
        const { supabase } = await import('@/lib/supabase');
        const { data } = await supabase.auth.getSession();
        if (data?.session?.access_token) {
          token = data.session.access_token;
        }
      } catch (e) {
        console.warn('Failed to get Supabase token', e);
      }

      const response = await fetch(`${baseUrl}/agent/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(params),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error(`Stream error: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No reader available');
      }

      let buffer = '';
      // The server emits a chat_info event with the canonical chat id; return
      // it so callers can persist it and keep the conversation continuous.
      let resolvedChatId = params.chatId;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        buffer = lines.pop() || ''; // Keep the incomplete line in the buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6);
            if (dataStr === '[DONE]') {
              return resolvedChatId;
            }
            try {
              const eventData = JSON.parse(dataStr);
              if (eventData.type === 'chat_info') {
                resolvedChatId = (eventData.data as { chatId: string }).chatId || resolvedChatId;
              }
              if (eventData.type === 'stream_end') {
                setIsStreaming(false);
                return resolvedChatId;
              }
              onEvent(eventData as AgentEvent);
            } catch (e) {
              console.warn('Failed to parse SSE JSON:', dataStr, e);
            }
          }
        }
      }
      return resolvedChatId;
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Stream aborted');
      } else {
        throw err;
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  }, []);

  const abort = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  }, []);

  return { stream, isStreaming, abort };
}
