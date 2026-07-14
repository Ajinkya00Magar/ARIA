// ─────────────────────────────────────────────────────────────────────────────
// IDE Chat Panel — Streaming AI Agent Chat
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send, X, StopCircle, RefreshCw, Copy, ChevronDown,
  ChevronRight, Wrench, CheckCircle2, XCircle, Loader2,
  Bot, User, Sparkles, AlertCircle,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { AgentEvent, ToolName } from '@ibm-agent/types';
import { useAgentStream } from '@/hooks/use-agent-stream';
import { useToast } from '@/hooks/use-toast';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolExecution[];
  isStreaming?: boolean;
  error?: string;
  timestamp: Date;
}

interface ToolExecution {
  id: string;
  name: ToolName;
  args: Record<string, unknown>;
  output?: string;
  error?: string;
  duration?: number;
  status: 'running' | 'done' | 'error';
}

interface IDEChatProps {
  workspaceId: string;
  onClose?: () => void;
}

export function IDEChat({ workspaceId, onClose }: IDEChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'system',
      content:
        '👋 **ARIA** ready. I can read files, write code, run tests, manage git, and more. What would you like to build?',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [chatId, setChatId] = useState<string>('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();
  const { stream, isStreaming, abort } = useAgentStream();
  const currentAssistantIdRef = useRef<string>('');

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
    }, 50);
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const handleEvent = useCallback((event: AgentEvent) => {
    const aid = currentAssistantIdRef.current;

    switch (event.type) {
      case 'content_delta': {
        const { delta } = event.data as { delta: string };
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aid ? { ...m, content: m.content + delta, isStreaming: true } : m,
          ),
        );
        scrollToBottom();
        break;
      }
      case 'content_done': {
        const { content } = event.data as { content: string };
        setMessages((prev) =>
          prev.map((m) => (m.id === aid ? { ...m, content, isStreaming: false } : m)),
        );
        break;
      }
      case 'tool_start': {
        const { toolCallId, toolName, arguments: args } = event.data as {
          toolCallId: string; toolName: ToolName; arguments: Record<string, unknown>;
        };
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== aid) return m;
            const toolCalls = [...(m.toolCalls ?? [])];
            toolCalls.push({ id: toolCallId, name: toolName, args, status: 'running' });
            return { ...m, toolCalls };
          }),
        );
        break;
      }
      case 'tool_end': {
        const { toolCallId, output, duration } = event.data as {
          toolCallId: string; output: string; duration: number;
        };
        setMessages((prev) =>
          prev.map((m) => ({
            ...m,
            toolCalls: m.toolCalls?.map((tc) =>
              tc.id === toolCallId ? { ...tc, output, duration, status: 'done' as const } : tc,
            ),
          })),
        );
        break;
      }
      case 'tool_error': {
        const { toolCallId, error } = event.data as { toolCallId: string; error: string };
        setMessages((prev) =>
          prev.map((m) => ({
            ...m,
            toolCalls: m.toolCalls?.map((tc) =>
              tc.id === toolCallId ? { ...tc, error, status: 'error' as const } : tc,
            ),
          })),
        );
        break;
      }
      case 'agent_error': {
        const { error } = event.data as { error: string };
        setMessages((prev) =>
          prev.map((m) => (m.id === aid ? { ...m, isStreaming: false, error } : m)),
        );
        break;
      }
    }
  }, [scrollToBottom]);

  const sendMessage = useCallback(async () => {
    const content = input.trim();
    if (!content || isStreaming) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    const assistantId = crypto.randomUUID();
    currentAssistantIdRef.current = assistantId;
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      isStreaming: true,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
    scrollToBottom();

    try {
      const newChatId = await stream(
        { chatId, content, workspaceId },
        handleEvent,
      );
      if (newChatId && !chatId) setChatId(newChatId);
    } catch (err) {
      toast({ title: 'Agent error', description: String(err), variant: 'destructive' });
    }
  }, [input, isStreaming, stream, chatId, workspaceId, handleEvent, scrollToBottom, toast]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const copyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
    toast({ title: 'Copied to clipboard' });
  };

  return (
    <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-primary/10 flex items-center justify-center">
            <Bot className="w-4 h-4 text-primary" />
          </div>
          <span className="text-sm font-medium">ARIA</span>
          {isStreaming && (
            <motion.div
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
              className="flex items-center gap-1 text-xs text-primary"
            >
              <Sparkles className="w-3 h-3" />
              <span>Thinking...</span>
            </motion.div>
          )}
        </div>
        <div className="flex items-center gap-1">
          {isStreaming && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={abort}>
              <StopCircle className="w-4 h-4 text-destructive" />
            </Button>
          )}
          {onClose && (
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1" ref={scrollRef as React.RefObject<HTMLDivElement>}>
        <div className="p-4 space-y-4">
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} onCopy={copyMessage} />
            ))}
          </AnimatePresence>
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t border-border flex-shrink-0">
        <div className="flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask anything about your code..."
            className="min-h-[60px] max-h-[200px] resize-none text-sm"
            disabled={isStreaming}
          />
          <Button
            size="icon"
            onClick={sendMessage}
            disabled={!input.trim() || isStreaming}
            className="h-10 w-10 flex-shrink-0"
          >
            {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2 text-center">
          Enter to send • Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

// ── Message Bubble ─────────────────────────────────────────────────────────────

function MessageBubble({
  message,
  onCopy,
}: {
  message: ChatMessage;
  onCopy: (content: string) => void;
}) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      <div
        className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-1 ${
          isUser ? 'bg-primary' : isSystem ? 'bg-muted' : 'bg-primary/10'
        }`}
      >
        {isUser ? (
          <User className="w-4 h-4 text-primary-foreground" />
        ) : (
          <Bot className="w-4 h-4 text-primary" />
        )}
      </div>

      {/* Content */}
      <div className={`flex-1 min-w-0 space-y-2 ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <div
          className={`rounded-xl px-4 py-3 text-sm max-w-full ${
            isUser
              ? 'bg-primary text-primary-foreground'
              : isSystem
              ? 'bg-muted text-muted-foreground'
              : 'bg-secondary'
          }`}
        >
          {isUser ? (
            <p className="whitespace-pre-wrap">{message.content}</p>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
              {message.isStreaming && (
                <span className="inline-block w-1 h-4 bg-primary animate-pulse ml-0.5" />
              )}
            </div>
          )}
          {message.error && (
            <div className="flex items-center gap-2 mt-2 text-destructive text-xs">
              <AlertCircle className="w-3 h-3" />
              {message.error}
            </div>
          )}
        </div>

        {/* Tool calls */}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <div className="w-full space-y-1">
            {message.toolCalls.map((tc) => (
              <ToolCallCard key={tc.id} tool={tc} />
            ))}
          </div>
        )}

        {/* Actions */}
        {!isUser && message.content && (
          <button
            onClick={() => onCopy(message.content)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <Copy className="w-3 h-3" />
            Copy
          </button>
        )}
      </div>
    </motion.div>
  );
}

// ── Tool Call Card ─────────────────────────────────────────────────────────────

function ToolCallCard({ tool }: { tool: ToolExecution }) {
  const [expanded, setExpanded] = useState(false);

  const statusIcon = {
    running: <Loader2 className="w-3 h-3 animate-spin text-primary" />,
    done: <CheckCircle2 className="w-3 h-3 text-green-500" />,
    error: <XCircle className="w-3 h-3 text-destructive" />,
  }[tool.status];

  return (
    <div className="border border-border rounded-lg overflow-hidden text-xs">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-2 w-full px-3 py-2 bg-muted/50 hover:bg-muted transition-colors text-left"
      >
        {statusIcon}
        <Wrench className="w-3 h-3 text-muted-foreground" />
        <span className="font-mono text-muted-foreground">{tool.name}</span>
        {tool.duration && (
          <span className="ml-auto text-muted-foreground">{tool.duration}ms</span>
        )}
        {expanded ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground ml-1" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground ml-1" />
        )}
      </button>

      {expanded && (
        <div className="p-3 space-y-2 bg-background">
          <div>
            <p className="text-muted-foreground mb-1">Arguments:</p>
            <pre className="font-mono text-xs bg-muted rounded p-2 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(tool.args, null, 2)}
            </pre>
          </div>
          {tool.output && (
            <div>
              <p className="text-muted-foreground mb-1">Output:</p>
              <pre className="font-mono text-xs bg-muted rounded p-2 overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap">
                {tool.output}
              </pre>
            </div>
          )}
          {tool.error && (
            <div className="text-destructive text-xs bg-destructive/10 rounded p-2">
              {tool.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
