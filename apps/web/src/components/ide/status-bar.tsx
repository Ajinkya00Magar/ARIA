'use client';

import { GitBranch, Loader2, AlertCircle, CheckCircle2, Zap, Circle } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useAgentStore } from '@/stores/agent-store';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
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
    (gitStatus?.staged.length ?? 0) +
    (gitStatus?.unstaged.length ?? 0) +
    (gitStatus?.untracked.length ?? 0);

  const AgentIcon = () => {
    if (agentStatus === 'thinking' || agentStatus === 'executing') {
      return <Loader2 className="h-3 w-3 animate-spin text-white/80" />;
    }
    if (agentStatus === 'error') {
      return <AlertCircle className="h-3 w-3 text-red-300" />;
    }
    if (agentStatus === 'done') {
      return <CheckCircle2 className="h-3 w-3 text-green-300" />;
    }
    return <Circle className="h-2 w-2 fill-white/40 text-white/40" />;
  };

  const agentLabel = {
    thinking: 'Thinking…',
    executing: 'Executing…',
    done: 'Done',
    error: 'Error',
    idle: 'Ready',
    waiting: 'Waiting…',
  }[agentStatus] ?? 'Ready';

  return (
    <div className="h-6 flex items-center px-3 bg-[#0f62fe] text-white text-[11px] shrink-0 gap-4 overflow-hidden select-none">
      {/* ── Left: Git info ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-1 overflow-hidden">
        {gitStatus ? (
          <button
            type="button"
            className="flex items-center gap-1.5 shrink-0 hover:bg-white/10 rounded px-1 py-0.5 transition-colors"
            title={`Branch: ${gitStatus.branch}`}
          >
            <GitBranch className="h-3 w-3" />
            <span className="font-medium">{gitStatus.branch}</span>
            {changedCount > 0 && (
              <span className="bg-white/20 rounded px-1 text-[10px]">{changedCount}</span>
            )}
          </button>
        ) : currentWorkspace ? (
          <span className="text-white/50 shrink-0 text-[10px]">No git</span>
        ) : null}

        {currentWorkspace && (
          <span className="text-white/60 truncate text-[10px]">{currentWorkspace.name}</span>
        )}
      </div>

      {/* ── Center: ARIA agent status ──────────────────────────────────── */}
      <div className="flex items-center gap-1.5 shrink-0">
        <Zap className="h-3 w-3 text-white/80" />
        <AgentIcon />
        <span className="opacity-80 text-[10px]">{agentLabel}</span>
      </div>

      {/* ── Right: File info ───────────────────────────────────────────── */}
      <div className="flex items-center gap-3 shrink-0 ml-auto text-white/60 text-[10px]">
        {activeFile && (
          <>
            <span className="text-white/80 font-medium">{activeFile.language}</span>
            {activeFile.isDirty && (
              <span className="text-yellow-200" title="Unsaved changes">
                ●
              </span>
            )}
          </>
        )}
        <span className="text-white/70 font-medium">IBM Orchestrate</span>
      </div>
    </div>
  );
}
