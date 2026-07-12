'use client';

import { useQuery } from '@tanstack/react-query';
import { Brain, Trash2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { formatDistanceToNow } from 'date-fns';
import type { Memory, MemoryType } from '@ibm-agent/types';
import { cn } from '@/lib/utils';

const TYPE_COLORS: Record<MemoryType, string> = {
  conversation: 'bg-blue-500/20 text-blue-400',
  workspace: 'bg-green-500/20 text-green-400',
  repository: 'bg-purple-500/20 text-purple-400',
  task: 'bg-orange-500/20 text-orange-400',
  longterm: 'bg-pink-500/20 text-pink-400',
};

export function MemoryPanel() {
  const { currentWorkspace } = useWorkspaceStore();

  const { data: memories, isLoading } = useQuery<Memory[]>({
    queryKey: ['memories', currentWorkspace?.id],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Memory[] }>(
        `/memories?workspaceId=${currentWorkspace!.id}`,
      );
      return res.data.data;
    },
    enabled: !!currentWorkspace,
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
        <Brain className="h-3.5 w-3.5 text-primary" />
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          AI Memory
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="px-4 py-3 text-xs text-muted-foreground animate-pulse">Loading memories…</div>
        )}
        {memories?.length === 0 && (
          <div className="px-4 py-8 text-center">
            <Brain className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">No memories yet. Start chatting with the agent.</p>
          </div>
        )}
        {memories?.map((memory) => (
          <div key={memory.id} className="px-3 py-2.5 border-b border-border hover:bg-muted/40 group">
            <div className="flex items-start justify-between gap-2 mb-1">
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', TYPE_COLORS[memory.type])}>
                {memory.type}
              </span>
              <span className="text-[10px] text-muted-foreground/60">
                {formatDistanceToNow(new Date(memory.createdAt), { addSuffix: true })}
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{memory.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
