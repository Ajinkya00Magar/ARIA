'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { GitBranch, RefreshCw, Upload, Download, Check, Plus, Minus, Circle } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import type { GitStatus } from '@ibm-agent/types';
import { cn } from '@/lib/utils';
import { useState } from 'react';

export function GitPanel() {
  const { currentWorkspace } = useWorkspaceStore();
  const [commitMessage, setCommitMessage] = useState('');
  const qc = useQueryClient();

  const { data: status, isLoading, refetch } = useQuery<GitStatus>({
    queryKey: ['git-status', currentWorkspace?.id],
    queryFn: async () => {
      const res = await apiClient.get<{ data: GitStatus }>(
        `/git/${currentWorkspace!.id}/status`,
      );
      return res.data.data;
    },
    enabled: !!currentWorkspace,
    refetchInterval: 10_000,
  });

  const commitMutation = useMutation({
    mutationFn: async (msg: string) => {
      await apiClient.post(`/git/${currentWorkspace!.id}/commit`, { message: msg });
    },
    onSuccess: () => {
      toast.success('Committed successfully');
      setCommitMessage('');
      void qc.invalidateQueries({ queryKey: ['git-status', currentWorkspace?.id] });
    },
    onError: () => toast.error('Commit failed'),
  });

  const pushMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post(`/git/${currentWorkspace!.id}/push`);
    },
    onSuccess: () => toast.success('Pushed to remote'),
    onError: () => toast.error('Push failed'),
  });

  const pullMutation = useMutation({
    mutationFn: async () => {
      await apiClient.post(`/git/${currentWorkspace!.id}/pull`);
    },
    onSuccess: () => toast.success('Pulled from remote'),
    onError: () => toast.error('Pull failed'),
  });

  if (!currentWorkspace) {
    return (
      <div className="flex items-center justify-center h-full p-4">
        <p className="text-sm text-muted-foreground">No workspace open</p>
      </div>
    );
  }

  const changedCount =
    (status?.staged.length ?? 0) + (status?.unstaged.length ?? 0) + (status?.untracked.length ?? 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium">{status?.branch ?? 'main'}</span>
          {changedCount > 0 && (
            <span className="bg-primary text-primary-foreground text-[10px] px-1.5 py-0.5 rounded-full font-bold">
              {changedCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => refetch()} className="p-1 rounded hover:bg-muted text-muted-foreground">
            <RefreshCw className={cn('h-3 w-3', isLoading && 'animate-spin')} />
          </button>
          <button onClick={() => pullMutation.mutate()} className="p-1 rounded hover:bg-muted text-muted-foreground">
            <Download className="h-3 w-3" />
          </button>
          <button onClick={() => pushMutation.mutate()} className="p-1 rounded hover:bg-muted text-muted-foreground">
            <Upload className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Commit input */}
      <div className="px-3 py-2 border-b border-border shrink-0">
        <textarea
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder="Commit message…"
          rows={2}
          className="w-full bg-background border border-input rounded text-xs p-2 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          onClick={() => commitMessage && commitMutation.mutate(commitMessage)}
          disabled={!commitMessage || commitMutation.isPending}
          className="w-full mt-1.5 py-1 bg-primary text-primary-foreground text-xs rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {commitMutation.isPending ? 'Committing…' : `Commit (${changedCount} changes)`}
        </button>
      </div>

      {/* Changed files */}
      <div className="flex-1 overflow-y-auto">
        {status && (
          <>
            <FileSection title="Staged" files={status.staged.map((f) => ({ path: f.path, status: f.status }))} icon={<Check className="h-3 w-3 text-green-400" />} />
            <FileSection title="Changes" files={status.unstaged.map((f) => ({ path: f.path, status: f.status }))} icon={<Circle className="h-3 w-3 text-yellow-400" />} />
            <FileSection title="Untracked" files={status.untracked.map((f) => ({ path: f, status: '?' as const }))} icon={<Plus className="h-3 w-3 text-muted-foreground" />} />
          </>
        )}
      </div>
    </div>
  );
}

function FileSection({
  title,
  files,
  icon,
}: {
  title: string;
  files: Array<{ path: string; status: string }>;
  icon: React.ReactNode;
}) {
  if (files.length === 0) return null;
  return (
    <div>
      <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted/30">
        {title} ({files.length})
      </div>
      {files.map((f) => (
        <div
          key={f.path}
          className="flex items-center gap-2 px-3 py-1 hover:bg-muted/50 cursor-pointer text-xs"
        >
          {icon}
          <span className="flex-1 truncate text-foreground/90">{f.path.split('/').pop()}</span>
          <span className="text-muted-foreground/60 font-mono text-[10px] shrink-0">
            {f.path.split('/').slice(0, -1).join('/')}
          </span>
        </div>
      ))}
    </div>
  );
}
