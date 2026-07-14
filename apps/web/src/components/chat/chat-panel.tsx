'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Square, RotateCcw, Sparkles, Plus, Bot, User,
  ChevronDown, ChevronRight, Wrench, CheckCircle2, XCircle, Loader2, Copy,
  AlertCircle, FileCode, Terminal as TermIcon,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAgentStore } from '@/stores/agent-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useAuthStore } from '@/stores/auth-store';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { generateId } from '@ibm-agent/shared';
import type { AgentEvent } from '@ibm-agent/types';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';

interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  output?: string;
  error?: string;
  duration?: number;
  status: 'running' | 'done' | 'error';
}

// Tools that modify files — trigger explorer refresh
const FILE_MODIFYING_TOOLS = new Set([
  'write_file', 'create_file', 'delete_file', 'rename_file',
  'write', 'create', 'delete', 'rename', 'mkdir',
]);

export function ChatPanel() {
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [activeMsgToolCalls, setActiveMsgToolCalls] = useState<Map<string, ToolCall>>(new Map());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();

  const { messages, agentStatus, addMessage, appendStreamDelta, finalizeStream, setAgentStatus, clearMessages } =
    useAgentStore();
  const { currentWorkspace } = useWorkspaceStore();
  const { accessToken } = useAuthStore();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Load previous chat history when workspace changes
  useEffect(() => {
    async function loadChat() {
      if (!currentWorkspace) return;
      try {
        const res = await apiClient.get<{ data: { id: string }[] }>(
          `/chat?workspaceId=${currentWorkspace.id}`,
        );
        const chats = res.data.data;
        if (chats.length > 0) {
          const latestChat = chats[0];
          useAgentStore.getState().setChatId(latestChat.id);
          const msgRes = await apiClient.get<{ data: any[] }>(`/chat/${latestChat.id}/messages`);
          const loaded = msgRes.data.data.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            createdAt: new Date(m.createdAt),
            toolCalls: m.toolCalls,
          }));
          useAgentStore.getState().setMessages(loaded);
        } else {
          useAgentStore.getState().clearMessages();
        }
      } catch {
        // silently ignore — fresh state is fine
      }
    }
    void loadChat();
  }, [currentWorkspace]);

  const handleStop = useCallback(() => {
    abortController?.abort();
    setIsStreaming(false);
    setAgentStatus('idle');
  }, [abortController, setAgentStatus]);

  const handleSubmit = useCallback(async (overrideInput?: string) => {
    const userMessage = (overrideInput ?? input).trim();
    if (!userMessage || isStreaming) return;

    if (!currentWorkspace) {
      toast.warning('Open a workspace first so the agent can read and write files.');
      return;
    }

    setInput('');
    setIsStreaming(true);

    const msgId = generateId();
    addMessage({
      id: msgId,
      role: 'user',
      content: userMessage,
      createdAt: new Date(),
    });

    const chatId = useAgentStore.getState().chatId ?? generateId();
    const controller = new AbortController();
    setAbortController(controller);
    setAgentStatus('thinking');

    // Track tool calls for the current assistant response
    const toolCallMap = new Map<string, ToolCall>();
    setActiveMsgToolCalls(new Map());

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/agent/run`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
          },
          body: JSON.stringify({
            chatId,
            content: userMessage,
            workspaceId: currentWorkspace.id,
          }),
          signal: controller.signal,
        },
      );

      if (!response.body) throw new Error('No response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

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

          try {
            const event: AgentEvent = JSON.parse(raw);
            handleAgentEvent(event, toolCallMap);
          } catch {
            // skip malformed lines
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        toast.error('Agent error. Please try again.');
        setAgentStatus('error');
      }
    } finally {
      setIsStreaming(false);
      setAgentStatus('idle');
      setAbortController(null);
      setActiveMsgToolCalls(new Map());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [input, isStreaming, currentWorkspace, accessToken, addMessage, setAgentStatus]);

  function handleAgentEvent(event: AgentEvent, toolCallMap: Map<string, ToolCall>) {
    switch (event.type) {
      case 'content_delta':
        appendStreamDelta((event.data as { delta: string }).delta);
        break;
      case 'content_done':
        finalizeStream((event.data as { content: string }).content);
        break;
      case 'status_update':
        setAgentStatus(
          (event.data as { status: 'idle' | 'thinking' | 'executing' | 'waiting' | 'done' | 'error' }).status,
        );
        break;
      case 'agent_error':
        toast.error((event.data as { error: string }).error);
        setAgentStatus('error');
        break;
      case 'tool_start': {
        const { toolCallId, toolName, arguments: args } = event.data as {
          toolCallId: string; toolName: string; arguments: Record<string, unknown>;
        };
        const tc: ToolCall = { id: toolCallId, name: toolName, args: args ?? {}, status: 'running' };
        toolCallMap.set(toolCallId, tc);
        setActiveMsgToolCalls(new Map(toolCallMap));
        setAgentStatus('executing');
        break;
      }
      case 'tool_end': {
        const { toolCallId, output, duration } = event.data as {
          toolCallId: string; output: string; duration: number;
        };
        const tc = toolCallMap.get(toolCallId);
        if (tc) {
          tc.status = 'done';
          tc.output = output;
          tc.duration = duration;
          toolCallMap.set(toolCallId, tc);
          setActiveMsgToolCalls(new Map(toolCallMap));

          // Refresh file tree if this was a file-modifying tool
          if (FILE_MODIFYING_TOOLS.has(tc.name) && currentWorkspace) {
            void queryClient.invalidateQueries({ queryKey: ['file-tree', currentWorkspace.id] });
          }
        }
        break;
      }
      case 'tool_error': {
        const { toolCallId, error } = event.data as { toolCallId: string; error: string };
        const tc = toolCallMap.get(toolCallId);
        if (tc) {
          tc.status = 'error';
          tc.error = error;
          toolCallMap.set(toolCallId, tc);
          setActiveMsgToolCalls(new Map(toolCallMap));
        }
        break;
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const statusDot = {
    thinking: 'bg-yellow-400 animate-pulse',
    executing: 'bg-blue-400 animate-pulse',
    done: 'bg-green-400',
    error: 'bg-red-400',
    idle: 'bg-muted-foreground/40',
    waiting: 'bg-orange-400 animate-pulse',
  }[agentStatus] ?? 'bg-muted-foreground/40';

  const activeToolCalls = Array.from(activeMsgToolCalls.values());

  return (
    <div className="flex flex-col h-full bg-[#161616] border-l border-[#393939]">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#393939] shrink-0 bg-[#1e1e1e]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#0f62fe]/20 flex items-center justify-center">
            <Bot className="h-4 w-4 text-[#4589ff]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-white">IBM Coding Agent</span>
              <div className={cn('w-2 h-2 rounded-full', statusDot)} />
            </div>
            <span className="text-[10px] text-[#8d8d8d] leading-none">
              {agentStatus === 'idle'
                ? currentWorkspace ? `${currentWorkspace.name}` : 'No workspace open'
                : agentStatus}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isStreaming && (
            <motion.div
              animate={{ opacity: [1, 0.4, 1] }}
              transition={{ repeat: Infinity, duration: 1.4 }}
              className="flex items-center gap-1 text-[10px] text-[#4589ff] mr-1"
            >
              <Sparkles className="h-3 w-3" />
              <span>Working…</span>
            </motion.div>
          )}
          <button
            onClick={clearMessages}
            className="p-1.5 rounded hover:bg-[#393939] text-[#8d8d8d] hover:text-white transition-colors"
            title="New conversation"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── No workspace warning ──────────────────────────────────────────── */}
      {!currentWorkspace && (
        <div className="mx-3 mt-3 px-3 py-2 bg-[#f1c21b]/10 border border-[#f1c21b]/30 rounded-lg flex items-start gap-2">
          <AlertCircle className="h-3.5 w-3.5 text-[#f1c21b] shrink-0 mt-0.5" />
          <p className="text-[11px] text-[#f1c21b] leading-relaxed">
            Open a workspace so the agent can read, write, and run code. Go to the{' '}
            <Link href="/workspace" className="underline underline-offset-2">Workspaces</Link> page.
          </p>
        </div>
      )}

      {/* ── Active tool calls (live) ──────────────────────────────────────── */}
      {activeToolCalls.length > 0 && (
        <div className="mx-3 mt-2 space-y-1">
          {activeToolCalls.map((tc) => (
            <ToolCallBadge key={tc.id} tool={tc} />
          ))}
        </div>
      )}

      {/* ── Messages ──────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4">
        {messages.length === 0 && (
          <WelcomeMessage
            workspaceName={currentWorkspace?.name}
            onSuggestion={(s) => void handleSubmit(s)}
          />
        )}
        <AnimatePresence>
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* ── Input ─────────────────────────────────────────────────────────── */}
      <div className="px-3 pb-3 pt-2 border-t border-[#393939] shrink-0">
        <div className="relative bg-[#262626] border border-[#393939] rounded-xl overflow-hidden focus-within:border-[#0f62fe] transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              currentWorkspace
                ? 'Ask the agent to write, edit, run, or explain code…'
                : 'Open a workspace to start coding with the agent…'
            }
            rows={3}
            disabled={isStreaming || !currentWorkspace}
            className="w-full p-3 bg-transparent text-sm text-white resize-none focus:outline-none placeholder:text-[#6f6f6f] disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <div className="flex items-center justify-between px-3 py-2 bg-[#1e1e1e]/60 border-t border-[#393939]">
            <div className="flex items-center gap-2 text-xs text-[#8d8d8d]">
              <kbd className="px-1.5 py-0.5 bg-[#393939] rounded text-[10px] font-mono">Enter</kbd>
              <span>send</span>
              <kbd className="px-1.5 py-0.5 bg-[#393939] rounded text-[10px] font-mono">Shift+Enter</kbd>
              <span>newline</span>
            </div>
            <div className="flex items-center gap-2">
              {isStreaming ? (
                <button
                  onClick={handleStop}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-900/30 text-red-400 border border-red-900/50 rounded-lg text-xs hover:bg-red-900/50 transition-colors"
                >
                  <Square className="h-3.5 w-3.5" />
                  Stop
                </button>
              ) : (
                <button
                  onClick={() => void handleSubmit()}
                  disabled={!input.trim() || !currentWorkspace}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0f62fe] text-white rounded-lg text-xs hover:bg-[#0353e9] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <Send className="h-3.5 w-3.5" />
                  Send
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tool Call Badge (live indicator) ──────────────────────────────────────────

function ToolCallBadge({ tool }: { tool: ToolCall }) {
  const [expanded, setExpanded] = useState(false);

  const icons: Record<string, React.ReactNode> = {
    write_file: <FileCode className="h-3 w-3" />,
    create_file: <FileCode className="h-3 w-3" />,
    read_file: <FileCode className="h-3 w-3" />,
    terminal: <TermIcon className="h-3 w-3" />,
    execute_command: <TermIcon className="h-3 w-3" />,
  };

  const statusColors = {
    running: 'border-[#4589ff]/40 bg-[#0f62fe]/10 text-[#4589ff]',
    done: 'border-[#24a148]/40 bg-[#24a148]/10 text-[#24a148]',
    error: 'border-[#da1e28]/40 bg-[#da1e28]/10 text-[#ff8389]',
  };

  return (
    <div className={cn('rounded-lg border text-xs overflow-hidden', statusColors[tool.status])}>
      <button
        onClick={() => setExpanded(v => !v)}
        className="flex items-center gap-2 w-full px-3 py-1.5 text-left"
      >
        {tool.status === 'running' ? (
          <Loader2 className="h-3 w-3 animate-spin shrink-0" />
        ) : tool.status === 'done' ? (
          <CheckCircle2 className="h-3 w-3 shrink-0" />
        ) : (
          <XCircle className="h-3 w-3 shrink-0" />
        )}
        <Wrench className="h-3 w-3 shrink-0 opacity-60" />
        {icons[tool.name] ?? <Wrench className="h-3 w-3 shrink-0" />}
        <span className="font-mono">{tool.name}</span>
        {tool.duration && <span className="ml-auto opacity-60">{tool.duration}ms</span>}
        {expanded ? <ChevronDown className="h-3 w-3 ml-1 shrink-0" /> : <ChevronRight className="h-3 w-3 ml-1 shrink-0" />}
      </button>
      {expanded && (
        <div className="px-3 pb-2 space-y-1.5 bg-[#161616]/60">
          {Object.keys(tool.args).length > 0 && (
            <div>
              <p className="text-[10px] opacity-60 mb-0.5">Arguments</p>
              <pre className="text-[10px] font-mono opacity-80 whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
                {JSON.stringify(tool.args, null, 2)}
              </pre>
            </div>
          )}
          {tool.output && (
            <div>
              <p className="text-[10px] opacity-60 mb-0.5">Output</p>
              <pre className="text-[10px] font-mono opacity-80 whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
                {tool.output}
              </pre>
            </div>
          )}
          {tool.error && (
            <p className="text-[10px] text-[#ff8389]">{tool.error}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Message Bubble ─────────────────────────────────────────────────────────────

function MessageBubble({
  message,
}: {
  message: {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    isStreaming?: boolean;
    events?: AgentEvent[];
    createdAt: Date;
  };
}) {
  const copyContent = () => {
    void navigator.clipboard.writeText(message.content);
    toast.success('Copied to clipboard');
  };

  if (message.role === 'user') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-end"
      >
        <div className="max-w-[85%] bg-[#0f62fe] text-white rounded-2xl rounded-br-sm px-4 py-2.5 text-sm leading-relaxed">
          {message.content}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-2 group"
    >
      <div className="flex items-start gap-2">
        <div className="w-6 h-6 rounded-full bg-[#0f62fe]/20 flex items-center justify-center shrink-0 mt-0.5">
          <Bot className="h-3.5 w-3.5 text-[#4589ff]" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="bg-[#262626] border border-[#393939] rounded-2xl rounded-tl-sm px-4 py-3 text-sm text-[#f4f4f4]">
            {message.content ? (
              <div className="prose prose-sm prose-invert max-w-none prose-pre:bg-[#161616] prose-pre:border prose-pre:border-[#393939] prose-code:text-[#4589ff] prose-code:bg-[#393939]/50 prose-code:rounded prose-code:px-1">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {message.content}
                </ReactMarkdown>
                {message.isStreaming && (
                  <span className="inline-block w-1.5 h-4 bg-[#4589ff] animate-pulse ml-0.5 rounded-sm" />
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 text-[#8d8d8d]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span className="text-xs">Thinking…</span>
              </div>
            )}
          </div>

          {/* Actions */}
          {!message.isStreaming && message.content && (
            <div className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={copyContent}
                className="flex items-center gap-1 text-[10px] text-[#8d8d8d] hover:text-white transition-colors"
              >
                <Copy className="h-3 w-3" />
                Copy
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Welcome Screen ─────────────────────────────────────────────────────────────

function WelcomeMessage({
  workspaceName,
  onSuggestion,
}: {
  workspaceName?: string;
  onSuggestion: (s: string) => void;
}) {
  return (
    <div className="flex flex-col items-center text-center py-8 gap-4">
      {/* IBM-styled hexagon logo */}
      <div className="relative w-16 h-16">
        <div className="absolute inset-0 bg-[#0f62fe]/20 rounded-2xl rotate-12" />
        <div className="absolute inset-0 bg-[#0f62fe]/10 rounded-2xl -rotate-6" />
        <div className="relative w-16 h-16 rounded-2xl bg-[#0f62fe]/30 border border-[#0f62fe]/40 flex items-center justify-center">
          <Sparkles className="h-7 w-7 text-[#4589ff]" />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-white">IBM Coding Agent</h3>
        <p className="text-[11px] text-[#8d8d8d] mt-1">Powered by IBM Orchestrate</p>
      </div>

      <p className="text-xs text-[#a8a8a8] max-w-[220px] leading-relaxed">
        {workspaceName
          ? `Ready to help with ${workspaceName}. Ask me to write code, fix bugs, run tests, or explain anything.`
          : 'Open a workspace to start. The agent will read, write, and run code directly in your project.'}
      </p>

      {workspaceName && (
        <div className="grid grid-cols-1 gap-1.5 w-full mt-1">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.label}
              onClick={() => onSuggestion(s.prompt)}
              className="text-left text-xs px-3 py-2 rounded-lg border border-[#393939] hover:border-[#0f62fe]/50 hover:bg-[#0f62fe]/10 transition-all text-[#8d8d8d] hover:text-white"
            >
              <span className="mr-2">{s.icon}</span>
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const SUGGESTIONS = [
  { icon: '📁', label: 'Analyze project architecture', prompt: 'Analyze this project and explain the architecture, directory structure, and main components.' },
  { icon: '🐛', label: 'Find & fix TypeScript errors', prompt: 'Find and fix any TypeScript errors or type issues in the codebase.' },
  { icon: '🧪', label: 'Write unit tests', prompt: 'Write comprehensive unit tests for the main components and functions.' },
  { icon: '📝', label: 'Generate API documentation', prompt: 'Generate detailed API documentation for all endpoints.' },
  { icon: '⚡', label: 'Optimize performance', prompt: 'Identify and fix performance bottlenecks in the code.' },
];
