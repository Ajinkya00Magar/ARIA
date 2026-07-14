'use client';

import { useRef, useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, Square, Plus, User,
  ChevronDown, ChevronRight, CheckCircle2, XCircle, Loader2, Copy,
  AlertCircle, FileCode, Terminal as TermIcon, Wrench, Zap,
  Search, GitBranch, FolderOpen, RotateCcw,
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

const FILE_MODIFYING_TOOLS = new Set([
  'write_file', 'create_file', 'delete_file', 'rename_file',
  'write', 'create', 'delete', 'rename', 'mkdir', 'move_file', 'create_folder',
]);

function AriaLogo({ size = 'sm' }: { size?: 'sm' | 'md' | 'lg' }) {
  const dims = { sm: 'w-6 h-6', md: 'w-8 h-8', lg: 'w-12 h-12' };
  const icon = { sm: 'h-3.5 w-3.5', md: 'h-4 w-4', lg: 'h-6 w-6' };
  return (
    <div className={cn(dims[size], 'rounded-lg bg-[#0f62fe] flex items-center justify-center shrink-0 shadow-md shadow-[#0f62fe]/25')}>
      <Zap className={cn(icon[size], 'text-white')} strokeWidth={2.5} />
    </div>
  );
}

export function ChatPanel() {
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [activeMsgToolCalls, setActiveMsgToolCalls] = useState<Map<string, ToolCall>>(new Map());
  const [autoScrollEnabled, setAutoScrollEnabled] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();

  const { messages, agentStatus, addMessage, appendStreamDelta, finalizeStream, setAgentStatus, clearMessages } =
    useAgentStore();
  const { currentWorkspace } = useWorkspaceStore();
  const { accessToken } = useAuthStore();

  const scrollToBottom = useCallback(() => {
    if (autoScrollEnabled) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [autoScrollEnabled]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      setAutoScrollEnabled(scrollHeight - scrollTop - clientHeight < 80);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, []);

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
          const msgRes = await apiClient.get<{ data: Array<{
            id: string; role: string; content: string; createdAt: string;
          }> }>(`/chat/${latestChat.id}/messages`);
          const loaded = msgRes.data.data.map((m) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant' | 'system',
            content: m.content,
            createdAt: new Date(m.createdAt),
          }));
          useAgentStore.getState().setMessages(loaded);
        } else {
          useAgentStore.getState().clearMessages();
        }
      } catch {
        // fresh state is fine
      }
    }
    void loadChat();
  }, [currentWorkspace]);

  const handleStop = useCallback(() => {
    abortController?.abort();
    setIsStreaming(false);
    setAgentStatus('idle');
    toast.info('Stopped');
  }, [abortController, setAgentStatus]);

  const handleSubmit = useCallback(async (overrideInput?: string) => {
    const userMessage = (overrideInput ?? input).trim();
    if (!userMessage || isStreaming) return;

    setInput('');
    setIsStreaming(true);

    const msgId = generateId();
    addMessage({ id: msgId, role: 'user', content: userMessage, createdAt: new Date() });

    const chatId = useAgentStore.getState().chatId ?? generateId();
    const controller = new AbortController();
    setAbortController(controller);
    setAgentStatus('thinking');
    setActiveMsgToolCalls(new Map());
    const toolCallMap = new Map<string, ToolCall>();

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
            workspaceId: currentWorkspace?.id ?? '',
          }),
          signal: controller.signal,
        },
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
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
            const event = JSON.parse(raw) as AgentEvent;
            handleAgentEvent(event, toolCallMap);
          } catch { /* skip */ }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        toast.error(getFriendlyError(undefined, (err as Error).message));
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
        setAutoScrollEnabled(true);
        break;
      case 'content_done':
        finalizeStream((event.data as { content: string }).content);
        break;
      case 'status_update':
        setAgentStatus((event.data as { status: 'idle' | 'thinking' | 'executing' | 'waiting' | 'done' | 'error' }).status);
        break;
      case 'agent_error': {
        const { error, code } = event.data as { error: string; code?: string };
        toast.error(getFriendlyError(code, error));
        setAgentStatus('error');
        break;
      }
      case 'tool_start': {
        const { toolCallId, toolName, arguments: args } = event.data as {
          toolCallId: string; toolName: string; arguments: Record<string, unknown>;
        };
        toolCallMap.set(toolCallId, { id: toolCallId, name: toolName, args: args ?? {}, status: 'running' });
        setActiveMsgToolCalls(new Map(toolCallMap));
        setAgentStatus('executing');
        break;
      }
      case 'tool_end': {
        const { toolCallId, output, duration } = event.data as { toolCallId: string; output: string; duration: number };
        const tc = toolCallMap.get(toolCallId);
        if (tc) {
          tc.status = 'done'; tc.output = output; tc.duration = duration;
          toolCallMap.set(toolCallId, tc);
          setActiveMsgToolCalls(new Map(toolCallMap));
          if (FILE_MODIFYING_TOOLS.has(tc.name) && currentWorkspace) {
            void queryClient.invalidateQueries({ queryKey: ['file-tree', currentWorkspace.id] });
          }
        }
        break;
      }
      case 'tool_error': {
        const { toolCallId, error } = event.data as { toolCallId: string; error: string };
        const tc = toolCallMap.get(toolCallId);
        if (tc) { tc.status = 'error'; tc.error = error; toolCallMap.set(toolCallId, tc); setActiveMsgToolCalls(new Map(toolCallMap)); }
        break;
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSubmit(); }
  };

  const activeToolCalls = Array.from(activeMsgToolCalls.values());
  const isActive = agentStatus === 'thinking' || agentStatus === 'executing';

  return (
    <div className="flex flex-col h-full bg-[#161616] border-l border-[#262626]">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#262626] shrink-0 bg-[#141414]">
        <div className="flex items-center gap-2.5">
          <AriaLogo size="sm" />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-white tracking-wide">ARIA</span>
              {isActive && (
                <motion.div animate={{ opacity: [1, 0.3, 1] }} transition={{ repeat: Infinity, duration: 1.2 }}>
                  <div className="w-1.5 h-1.5 rounded-full bg-[#4589ff]" />
                </motion.div>
              )}
            </div>
            <span className="text-[10px] text-[#3d3d3d] leading-none">
              {currentWorkspace ? currentWorkspace.name : 'IBM watsonx Orchestrate'}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {isActive && (
            <span className="text-[10px] text-[#4589ff] mr-1">
              {agentStatus === 'executing' ? 'Running…' : 'Thinking…'}
            </span>
          )}
          <button
            onClick={clearMessages}
            className="p-1.5 rounded-lg hover:bg-[#1e1e1e] text-[#525252] hover:text-white transition-colors"
            title="New conversation"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* No workspace notice */}
      {!currentWorkspace && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="mx-3 mt-3 px-3 py-2 bg-[#f1c21b]/6 border border-[#f1c21b]/20 rounded-lg flex items-start gap-2">
          <AlertCircle className="h-3.5 w-3.5 text-[#f1c21b] shrink-0 mt-0.5" />
          <p className="text-[11px] text-[#f1c21b]/80 leading-relaxed">
            Open a workspace so ARIA can read and write code.{' '}
            <Link href="/workspace" className="underline underline-offset-2">Browse workspaces</Link>
          </p>
        </motion.div>
      )}

      {/* Live tool activity */}
      <AnimatePresence>
        {activeToolCalls.length > 0 && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }} className="mx-3 mt-2 space-y-1 overflow-hidden">
            {activeToolCalls.map((tc) => <ToolCallCard key={tc.id} tool={tc} />)}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-3 py-4 space-y-5">
        {messages.length === 0 && (
          <WelcomeScreen workspaceName={currentWorkspace?.name} onSuggestion={(s) => void handleSubmit(s)} />
        )}
        <AnimatePresence initial={false}>
          {messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>

      {/* Scroll to bottom */}
      <AnimatePresence>
        {!autoScrollEnabled && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute bottom-24 right-5">
            <button onClick={() => { setAutoScrollEnabled(true); messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }}
              className="w-7 h-7 rounded-full bg-[#0f62fe] text-white flex items-center justify-center shadow-lg hover:bg-[#0353e9] transition-colors">
              <ChevronDown className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Composer */}
      <div className="px-3 pb-3 pt-2 border-t border-[#262626] shrink-0">
        <div className={cn(
          'relative bg-[#1a1a1a] border rounded-xl overflow-hidden transition-all',
          isStreaming ? 'border-[#0f62fe]/35' : 'border-[#262626] focus-within:border-[#0f62fe]/50',
        )}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={currentWorkspace
              ? `Ask ARIA about ${currentWorkspace.name}…`
              : 'Open a workspace to start…'}
            rows={3}
            disabled={isStreaming}
            className="w-full p-3 pb-2 bg-transparent text-[13px] text-white resize-none focus:outline-none placeholder:text-[#3d3d3d] disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <div className="flex items-center justify-between px-3 py-2 border-t border-[#1e1e1e]">
            <div className="text-[10px] text-[#3d3d3d] hidden sm:flex items-center gap-2">
              <span>↵ send</span>
              <span>⇧↵ newline</span>
            </div>
            <div className="flex items-center gap-2">
              {isStreaming ? (
                <button onClick={handleStop}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-red-900/20 text-red-400 border border-red-900/35 rounded-lg text-[11px] hover:bg-red-900/30 transition-colors">
                  <Square className="h-3 w-3" />
                  Stop
                </button>
              ) : (
                <button onClick={() => void handleSubmit()} disabled={!input.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0f62fe] text-white rounded-lg text-[11px] hover:bg-[#0353e9] transition-colors disabled:opacity-35 disabled:cursor-not-allowed">
                  <Send className="h-3 w-3" />
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

// Tool Call Card
function ToolCallCard({ tool }: { tool: ToolCall }) {
  const [expanded, setExpanded] = useState(false);

  const toolIcons: Record<string, React.ReactNode> = {
    read_file: <FileCode className="h-3 w-3" />,
    write_file: <FileCode className="h-3 w-3" />,
    create_file: <FileCode className="h-3 w-3" />,
    search_code: <Search className="h-3 w-3" />,
    list_files: <FolderOpen className="h-3 w-3" />,
    run_terminal: <TermIcon className="h-3 w-3" />,
    git_status: <GitBranch className="h-3 w-3" />,
  };

  const s = {
    running: { border: 'border-[#4589ff]/25 bg-[#0f62fe]/6', text: 'text-[#4589ff]', icon: <Loader2 className="h-3 w-3 animate-spin" /> },
    done: { border: 'border-[#24a148]/25 bg-[#24a148]/6', text: 'text-[#24a148]', icon: <CheckCircle2 className="h-3 w-3" /> },
    error: { border: 'border-[#da1e28]/25 bg-[#da1e28]/6', text: 'text-[#ff8389]', icon: <XCircle className="h-3 w-3" /> },
  }[tool.status];

  const primaryArg = (tool.args.path as string) ?? (tool.args.command as string) ?? (tool.args.query as string) ?? '';

  return (
    <div className={cn('rounded-lg border text-[11px] overflow-hidden', s.border)}>
      <button onClick={() => setExpanded(v => !v)}
        className={cn('flex items-center gap-2 w-full px-3 py-1.5 text-left', s.text)}>
        {s.icon}
        {toolIcons[tool.name] ?? <Wrench className="h-3 w-3" />}
        <span className="font-mono font-medium">{tool.name.replace(/_/g, ' ')}</span>
        {primaryArg && <span className="text-[10px] opacity-50 truncate max-w-[100px]">{primaryArg}</span>}
        {tool.duration !== undefined && <span className="ml-auto text-[10px] opacity-40">{tool.duration}ms</span>}
        {expanded ? <ChevronDown className="h-3 w-3 ml-1 shrink-0 opacity-50" /> : <ChevronRight className="h-3 w-3 ml-1 shrink-0 opacity-50" />}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.12 }} className="overflow-hidden">
            <div className="px-3 pb-2 pt-1 space-y-1.5 bg-[#0e0e0e]/50 border-t border-[#262626]/50">
              {tool.output && (
                <pre className="text-[10px] font-mono text-[#8d8d8d] whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
                  {tool.output}
                </pre>
              )}
              {tool.error && <p className="text-[10px] text-[#ff8389]">{tool.error}</p>}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Message Bubble
function MessageBubble({ message }: {
  message: { id: string; role: 'user' | 'assistant' | 'system'; content: string; isStreaming?: boolean; createdAt: Date };
}) {
  const copyContent = () => {
    void navigator.clipboard.writeText(message.content);
    toast.success('Copied');
  };

  if (message.role === 'user') {
    return (
      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}
        className="flex justify-end gap-2">
        <div className="max-w-[85%] bg-[#0f62fe] text-white rounded-2xl rounded-br-md px-4 py-2.5 text-[13px] leading-relaxed">
          {message.content}
        </div>
        <div className="w-6 h-6 rounded-full bg-[#1e1e1e] border border-[#262626] flex items-center justify-center shrink-0 mt-0.5">
          <User className="h-3.5 w-3.5 text-[#6f6f6f]" />
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }}
      className="flex flex-col gap-1.5 group">
      <div className="flex items-start gap-2">
        <AriaLogo size="sm" />
        <div className="flex-1 min-w-0">
          <div className="bg-[#1a1a1a] border border-[#262626] rounded-2xl rounded-tl-md px-4 py-3 text-[13px] text-[#e0e0e0]">
            {message.content ? (
              <div className="prose prose-sm prose-invert max-w-none prose-p:leading-relaxed prose-p:my-1.5 prose-headings:text-[#f4f4f4] prose-a:text-[#4589ff]">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    code({ className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || '');
                      if (!match) {
                        return (
                          <code className="bg-[#1e1e1e] text-[#4589ff] rounded px-1.5 py-0.5 text-[11px] font-mono border border-[#2e2e2e]" {...props}>
                            {children}
                          </code>
                        );
                      }
                      return (
                        <div className="relative my-2 rounded-xl overflow-hidden border border-[#262626]">
                          <div className="flex items-center justify-between px-3 py-1.5 bg-[#0e0e0e] border-b border-[#1e1e1e]">
                            <span className="text-[10px] text-[#525252] font-mono">{match[1]}</span>
                            <button onClick={() => { void navigator.clipboard.writeText(String(children)); toast.success('Copied'); }}
                              className="text-[10px] text-[#525252] hover:text-[#a8a8a8] transition-colors flex items-center gap-1">
                              <Copy className="h-3 w-3" />Copy
                            </button>
                          </div>
                          <pre className="m-0 p-3 bg-[#0e0e0e] overflow-x-auto">
                            <code className="text-[11px] font-mono text-[#c8d3f5] leading-relaxed">{String(children).replace(/\n$/, '')}</code>
                          </pre>
                        </div>
                      );
                    },
                  }}
                >
                  {message.content}
                </ReactMarkdown>
                {message.isStreaming && (
                  <span className="inline-block w-1.5 h-4 bg-[#4589ff] animate-pulse ml-0.5 rounded-sm align-middle" />
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-[#3d3d3d]">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-[#4589ff]" />
                <span className="text-[12px]">ARIA is thinking…</span>
              </div>
            )}
          </div>
          {!message.isStreaming && message.content && (
            <div className="mt-1 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={copyContent}
                className="flex items-center gap-1 text-[10px] text-[#3d3d3d] hover:text-[#8d8d8d] transition-colors">
                <Copy className="h-3 w-3" />Copy
              </button>
              <button className="flex items-center gap-1 text-[10px] text-[#3d3d3d] hover:text-[#8d8d8d] transition-colors">
                <RotateCcw className="h-3 w-3" />Retry
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// Welcome Screen
function WelcomeScreen({ workspaceName, onSuggestion }: { workspaceName?: string; onSuggestion: (s: string) => void }) {
  return (
    <div className="flex flex-col items-center text-center py-10 gap-5">
      <div className="relative">
        <div className="w-14 h-14 rounded-2xl bg-[#0f62fe] flex items-center justify-center shadow-lg shadow-[#0f62fe]/25">
          <Zap className="h-7 w-7 text-white" strokeWidth={2} />
        </div>
        <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-[#24a148] border-2 border-[#161616]" />
      </div>
      <div>
        <h3 className="text-[15px] font-bold text-white tracking-tight">ARIA</h3>
        <p className="text-[11px] text-[#3d3d3d] mt-0.5">Powered by IBM watsonx Orchestrate</p>
      </div>
      <p className="text-[12px] text-[#6f6f6f] max-w-[220px] leading-relaxed">
        {workspaceName
          ? `Ready to help with ${workspaceName}. Ask me to write code, fix bugs, run tests, or explain anything.`
          : 'Open a workspace to start. ARIA reads, writes, and runs code in your project.'}
      </p>
      {workspaceName && (
        <div className="w-full space-y-1.5 mt-1">
          {SUGGESTIONS.map((s) => (
            <button key={s.label} onClick={() => onSuggestion(s.prompt)}
              className="w-full text-left text-[11px] px-3 py-2 rounded-xl border border-[#1e1e1e] hover:border-[#0f62fe]/30 hover:bg-[#0f62fe]/4 transition-all text-[#525252] hover:text-[#a8a8a8] flex items-center gap-2.5">
              <span>{s.icon}</span>
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const SUGGESTIONS = [
  { icon: '🔍', label: 'Analyze project structure', prompt: 'Analyze this project and explain the architecture, directory structure, and main components.' },
  { icon: '🐛', label: 'Find TypeScript errors', prompt: 'Find and fix any TypeScript errors or type issues in the codebase.' },
  { icon: '🧪', label: 'Write unit tests', prompt: 'Write comprehensive unit tests for the main components and functions.' },
  { icon: '📝', label: 'Generate documentation', prompt: 'Generate detailed documentation for the key modules and functions.' },
  { icon: '⚡', label: 'Review and optimize', prompt: 'Review the codebase for performance issues and suggest improvements.' },
];

function getFriendlyError(code?: string, fallback?: string): string {
  const map: Record<string, string> = {
    IBM_AUTH_ERROR: 'IBM authentication failed. Check your API key.',
    IBM_RATE_LIMITED: 'Rate limit reached. Wait a moment and try again.',
    IBM_SERVICE_UNAVAILABLE: 'IBM Orchestrate is temporarily unavailable.',
    IBM_TIMEOUT: 'Request timed out. Please try again.',
  };
  return (code && map[code]) ? map[code] : (fallback ?? 'An unexpected error occurred');
}
