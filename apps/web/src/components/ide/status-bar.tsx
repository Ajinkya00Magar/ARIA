'use client';

import { GitBranch, Circle, Wifi, WifiOff, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useAgentStore } from '@/stores/agent-store';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import type { GitStatus } from '@ibm-agent/types';

export function StatusBar() {
  const { currentWorkspace, activeFileIndex, openFiles } = useWorkspaceStore();
  const { agentStatus } = useAgentStore();
  const activeFile = openFiles[activeFileIndex];

  const { data: gitStatus } = useQuery<GitStatus>({
    queryKey: ['git-status-bar', currentWorkspace?.id],
    queryFn: async () => {
      const res = await apiClient.get<{ data: GitStatus }>(`/git/${currentWorkspace!.id}/status`);
      return res.data.data;
    },
    enabled: !!currentWorkspace,
    refetchInterval: 20_000,
  });

  const changedCount =
    (gitStatus?.staged?.length ?? 0) +
    (gitStatus?.unstaged?.length ?? 0) +
    (gitStatus?.untracked?.length ?? 0);

  const agentIcon = {
    thinking: <Loader2 className="h-3 w-3 animate-spin text-yellow-300" />,
    executing: <Loader2 className="h-3 w-3 animate-spin text-blue-300" />,
    done: <CheckCircle2 className="h-3 w-3 text-green-300" />,
    error: <AlertCircle className="h-3 w-3 text-red-300" />,
    idle: <Circle className="h-2.5 w-2.5 fill-current text-white/30" />,
    waiting: <Loader2 className="h-3 w-3 animate-spin text-orange-300" />,
  }[agentStatus] ?? <Circle className="h-2.5 w-2.5 fill-current text-white/30" />;

  const agentLabel = {
    thinking: 'Thinking…',
    executing: 'Executing tool…',
    done: 'Done',
    error: 'Error',
    idle: 'Ready',
    waiting: 'Waiting…',
  }[agentStatus] ?? 'Ready';

  return (
    <div className="h-6 flex items-center px-3 bg-[#0f62fe] text-white text-[11px] shrink-0 gap-3 overflow-hidden">
      {/* ── Left: Git ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-1 overflow-hidden">
        {gitStatus ? (
          <button
            type="button"
            className="flex items-center gap-1 shrink-0 hover:bg-white/10 rounded px-1 transition-colors"
            title={`Branch: ${gitStatus.branch}`}
          >
            <GitBranch className="h-3 w-3" />
            <span>{gitStatus.branch}</span>
            {changedCount > 0 && (
              <span className="ml-0.5 bg-white/20 rounded px-1 text-[10px]">{changedCount}</span>
            )}
          </button>
        ) : currentWorkspace ? (
          <span className="text-white/60 shrink-0">No git</span>
        ) : null}

        {currentWorkspace && (
          <span className="text-white/70 truncate text-[10px]">{currentWorkspace.name}</span>
        )}
      </div>

      {/* ── Center: Agent Status ──────────────────────────────────────────── */}
      <div className="flex items-center gap-1.5 shrink-0">
        {agentIcon}
        <span className="opacity-90 text-[10px]">{agentLabel}</span>
      </div>

      {/* ── Right: File info + connection ─────────────────────────────────── */}
      <div className="flex items-center gap-3 shrink-0 ml-auto text-white/70 text-[10px]">
        {activeFile && (
          <>
            <span className="text-white/90">{activeFile.language}</span>
            {activeFile.isDirty && <span className="text-yellow-300" title="Unsaved changes">●</span>}
          </>
        )}
        <span className="text-white/80">IBM Orchestrate</span>
        <Wifi className="h-3 w-3 text-green-300" />
      </div>
    </div>
  );
}
