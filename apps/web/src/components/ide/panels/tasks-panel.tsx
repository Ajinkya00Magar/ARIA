'use client';

import { useQuery } from '@tanstack/react-query';
import { CheckCircle, Clock, Loader2, XCircle, StopCircle } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useWorkspaceStore } from '@/stores/workspace-store';
import type { Task, TaskStatus } from '@ibm-agent/types';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

const STATUS_ICON: Record<TaskStatus, React.ReactNode> = {
  queued: <Clock className="h-3.5 w-3.5 text-muted-foreground" />,
  running: <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />,
  completed: <CheckCircle className="h-3.5 w-3.5 text-green-400" />,
  failed: <XCircle className="h-3.5 w-3.5 text-destructive" />,
  cancelled: <StopCircle className="h-3.5 w-3.5 text-muted-foreground" />,
};

export function TasksPanel() {
  const { currentWorkspace } = useWorkspaceStore();

  const { data: tasks, isLoading } = useQuery<Task[]>({
    queryKey: ['tasks', currentWorkspace?.id],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Task[] }>('/tasks', {
        params: { workspaceId: currentWorkspace!.id },
      });
      return res.data.data;
    },
    enabled: !!currentWorkspace,
    refetchInterval: 5000,
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 border-b border-border">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tasks</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && (
          <div className="px-4 py-3 text-xs text-muted-foreground animate-pulse">Loading…</div>
        )}
        {tasks?.length === 0 && (
          <div className="px-4 py-3 text-xs text-muted-foreground">No tasks yet</div>
        )}
        {tasks?.map((task) => (
          <div
            key={task.id}
            className="px-3 py-2.5 border-b border-border last:border-0 hover:bg-muted/40"
          >
            <div className="flex items-start gap-2">
              <div className="mt-0.5 shrink-0">{STATUS_ICON[task.status]}</div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium truncate">{task.name}</p>
                {task.description && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{task.description}</p>
                )}
                {task.progress !== undefined && task.progress > 0 && (
                  <div className="mt-1.5 h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${task.progress}%` }}
                    />
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground/60 mt-1">
                  {formatDistanceToNow(new Date(task.createdAt), { addSuffix: true })}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
