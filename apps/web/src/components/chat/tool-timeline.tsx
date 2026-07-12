'use client';

import { motion } from 'framer-motion';
import { CheckCircle, XCircle, Loader2, Wrench } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { AgentEvent } from '@ibm-agent/types';
import { formatDuration } from '@ibm-agent/shared';

interface ToolTimelineProps {
  events: AgentEvent[];
}

export function ToolTimeline({ events }: ToolTimelineProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const toolStarts = events.filter((e) => e.type === 'tool_start') as Array<
    AgentEvent & { data: { toolCallId: string; toolName: string; arguments: Record<string, unknown> } }
  >;

  return (
    <div className="space-y-1.5 pl-3 border-l-2 border-primary/30">
      {toolStarts.map((event) => {
        const endEvent = events.find(
          (e) =>
            e.type === 'tool_end' &&
            (e.data as { toolCallId: string }).toolCallId === event.data.toolCallId,
        );
        const errorEvent = events.find(
          (e) =>
            e.type === 'tool_error' &&
            (e.data as { toolCallId: string }).toolCallId === event.data.toolCallId,
        );

        const isExpanded = expanded === event.data.toolCallId;
        const isDone = !!endEvent;
        const isError = !!errorEvent;
        const duration = endEvent
          ? (endEvent.data as { duration: number }).duration
          : undefined;

        return (
          <motion.div
            key={event.data.toolCallId}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
          >
            <button
              onClick={() => setExpanded(isExpanded ? null : event.data.toolCallId)}
              className={cn(
                'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors',
                isExpanded ? 'bg-muted' : 'hover:bg-muted/60',
              )}
            >
              {isError ? (
                <XCircle className="h-3.5 w-3.5 text-destructive shrink-0" />
              ) : isDone ? (
                <CheckCircle className="h-3.5 w-3.5 text-green-400 shrink-0" />
              ) : (
                <Loader2 className="h-3.5 w-3.5 text-blue-400 shrink-0 animate-spin" />
              )}
              <Wrench className="h-3 w-3 text-muted-foreground shrink-0" />
              <span className="font-mono font-medium text-foreground">{event.data.toolName}</span>
              {duration !== undefined && (
                <span className="text-muted-foreground ml-auto">{formatDuration(duration)}</span>
              )}
            </button>

            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                className="mx-2 mb-1 overflow-hidden"
              >
                <div className="bg-black/30 rounded-lg p-2 font-mono text-[11px]">
                  <div className="text-muted-foreground mb-1">Arguments:</div>
                  <pre className="text-foreground/80 overflow-auto max-h-24 whitespace-pre-wrap break-all">
                    {JSON.stringify(event.data.arguments, null, 2)}
                  </pre>
                  {endEvent && (
                    <>
                      <div className="text-muted-foreground mt-2 mb-1">Output:</div>
                      <pre className="text-green-300/80 overflow-auto max-h-32 whitespace-pre-wrap break-all">
                        {String((endEvent.data as { output: string }).output).slice(0, 1000)}
                      </pre>
                    </>
                  )}
                  {errorEvent && (
                    <div className="text-destructive mt-1">
                      Error: {String((errorEvent.data as { error: string }).error)}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
