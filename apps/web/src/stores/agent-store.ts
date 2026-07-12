import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { AgentEvent, AgentStatus, ToolCall } from '@ibm-agent/types';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCall[];
  reasoning?: string;
  isStreaming?: boolean;
  events?: AgentEvent[];
  createdAt: Date;
}

interface AgentState {
  chatId: string | null;
  messages: ChatMessage[];
  agentStatus: AgentStatus;
  currentStreamContent: string;
  pendingToolCalls: ToolCall[];
  permissionRequest: PermissionRequest | null;

  setChatId: (id: string) => void;
  addMessage: (msg: ChatMessage) => void;
  appendStreamDelta: (delta: string) => void;
  finalizeStream: (content: string) => void;
  setAgentStatus: (status: AgentStatus) => void;
  addEvent: (msgId: string, event: AgentEvent) => void;
  setPermissionRequest: (req: PermissionRequest | null) => void;
  setMessages: (messages: ChatMessage[]) => void;
  clearMessages: () => void;
}

export interface PermissionRequest {
  requestId: string;
  action: string;
  description: string;
  details: Record<string, unknown>;
}

export const useAgentStore = create<AgentState>()(
  immer((set) => ({
    chatId: null,
    messages: [],
    agentStatus: 'idle',
    currentStreamContent: '',
    pendingToolCalls: [],
    permissionRequest: null,

    setChatId: (id) =>
      set((state) => {
        state.chatId = id;
      }),

    addMessage: (msg) =>
      set((state) => {
        state.messages.push(msg);
      }),

    appendStreamDelta: (delta) =>
      set((state) => {
        state.currentStreamContent += delta;
        const streamMsg = state.messages.find((m) => m.isStreaming);
        if (streamMsg) {
          streamMsg.content = state.currentStreamContent;
        } else {
          state.messages.push({
            id: `stream-${Date.now()}`,
            role: 'assistant',
            content: delta,
            isStreaming: true,
            events: [],
            createdAt: new Date(),
          });
        }
      }),

    finalizeStream: (content) =>
      set((state) => {
        const streamMsg = state.messages.find((m) => m.isStreaming);
        if (streamMsg) {
          streamMsg.content = content;
          streamMsg.isStreaming = false;
        }
        state.currentStreamContent = '';
      }),

    setAgentStatus: (status) =>
      set((state) => {
        state.agentStatus = status;
      }),

    addEvent: (msgId, event) =>
      set((state) => {
        const msg = state.messages.find((m) => m.id === msgId || m.isStreaming);
        if (msg) {
          if (!msg.events) msg.events = [];
          msg.events.push(event);
        }
      }),

    setPermissionRequest: (req) =>
      set((state) => {
        state.permissionRequest = req;
      }),

    setMessages: (messages) =>
      set((state) => {
        state.messages = messages;
      }),

    clearMessages: () =>
      set((state) => {
        state.messages = [];
        state.currentStreamContent = '';
        state.agentStatus = 'idle';
      }),
  })),
);
