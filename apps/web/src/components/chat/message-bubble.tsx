'use client';

import { motion } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { Copy, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { ToolTimeline } from './tool-timeline';
import type { AgentEvent } from '@ibm-agent/types';
import 'highlight.js/styles/github-dark.css';

interface ChatMessageProps {
  message: {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    isStreaming?: boolean;
    events?: AgentEvent[];
    createdAt: Date;
  };
}

export function MessageBubble({ message }: ChatMessageProps) {
  const [showEvents, setShowEvents] = useState(false);
  const toolEvents = message.events?.filter((e) =>
    e.type === 'tool_start' || e.type === 'tool_end' || e.type === 'tool_error',
  ) ?? [];

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
        <div className="max-w-[85%] bg-primary text-primary-foreground rounded-2xl rounded-br-sm px-4 py-2.5 text-sm">
          {message.content}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col gap-2"
    >
      {/* Tool timeline */}
      {toolEvents.length > 0 && (
        <div>
          <button
            onClick={() => setShowEvents(!showEvents)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-1"
          >
            {showEvents ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {toolEvents.length} tool call{toolEvents.length !== 1 ? 's' : ''}
          </button>
          {showEvents && <ToolTimeline events={toolEvents} />}
        </div>
      )}

      {/* Message content */}
      <div className="group relative">
        <div
          className={cn(
            'bg-card border border-border rounded-2xl rounded-tl-sm px-4 py-3 text-sm prose prose-sm prose-invert max-w-none',
            message.isStreaming && 'streaming-cursor',
          )}
        >
          {message.content ? (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
              components={{
                pre: ({ children }) => (
                  <pre className="not-prose overflow-auto rounded-lg bg-black/40 border border-border text-xs my-2">
                    {children}
                  </pre>
                ),
                code: ({ children, className }) => {
                  const isInline = !className;
                  return isInline ? (
                    <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono text-primary">
                      {children}
                    </code>
                  ) : (
                    <code className={cn('text-xs', className)}>{children}</code>
                  );
                },
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noreferrer" className="text-primary hover:underline">
                    {children}
                  </a>
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
          ) : (
            <div className="flex items-center gap-2 text-muted-foreground">
              <span className="animate-bounce">●</span>
              <span className="animate-bounce delay-100">●</span>
              <span className="animate-bounce delay-200">●</span>
            </div>
          )}
        </div>

        {/* Actions */}
        {!message.isStreaming && (
          <div className="absolute -bottom-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-card border border-border rounded-full px-1.5 py-0.5 shadow-sm">
            <button onClick={copyContent} className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground">
              <Copy className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}
