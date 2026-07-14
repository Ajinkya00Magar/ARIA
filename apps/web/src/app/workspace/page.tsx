'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FolderOpen, Plus, GitBranch, Clock, Pin, Trash2,
  LogOut, Search, ExternalLink, Loader2,
  ChevronRight, Zap, Terminal, AlertCircle, CheckCircle,
} from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import type { Workspace } from '@ibm-agent/types';
import { formatDistanceToNow } from 'date-fns';
import { CreateWorkspaceModal } from '@/components/workspace/create-workspace-modal';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';

export default function WorkspacePage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [orchestrateStatus, setOrchestrateStatus] = useState<'checking' | 'connected' | 'offline'>('checking');
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const fetchWorkspaces = useCallback(async () => {
    try {
      const res = await apiClient.get<{ data: Workspace[] }>('/workspaces');
      setWorkspaces(res.data.data);
    } catch {
      toast.error('Failed to load workspaces');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchWorkspaces();
    // Check IBM Orchestrate status
    const checkOrchestrate = async () => {
      try {
        const res = await apiClient.get<{ data: { orchestrateEnabled: boolean } }>('/agent/status').catch(() => null);
        setOrchestrateStatus(res?.data?.data?.orchestrateEnabled ? 'connected' : 'offline');
      } catch {
        setOrchestrateStatus('offline');
      }
    };
    void checkOrchestrate();
  }, [fetchWorkspaces]);

  const openWorkspace = (id: string) => {
    router.push(`/workspace/${id}`);
  };

  const deleteWorkspace = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this workspace? This cannot be undone.')) return;
    try {
      await apiClient.delete(`/workspaces/${id}`);
      setWorkspaces((prev) => prev.filter((w) => w.id !== id));
      toast.success('Workspace deleted');
    } catch {
      toast.error('Delete failed');
    }
  };

  const pinWorkspace = async (id: string, pinned: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiClient.post(`/workspaces/${id}/pin`, { pin: !pinned });
      setWorkspaces((prev) => prev.map((w) => (w.id === id ? { ...w, isPinned: !pinned } : w)));
    } catch {
      toast.error('Failed to pin workspace');
    }
  };

  const filtered = workspaces.filter((w) => w.name.toLowerCase().includes(search.toLowerCase()));
  const pinned = filtered.filter((w) => w.isPinned);
  const recent = filtered.filter((w) => !w.isPinned);

  return (
    <div className="min-h-screen bg-[#101010] text-[#f4f4f4]">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="border-b border-[#262626] px-6 py-3 flex items-center justify-between bg-[#141414] sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-[#0f62fe] flex items-center justify-center shadow-md shadow-[#0f62fe]/30">
            <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
          </div>
          <div>
            <span className="font-bold text-[14px] text-white tracking-wide">ARIA</span>
            <p className="text-[10px] text-[#525252] leading-none mt-0.5">
              Agentic Repository Intelligence Assistant
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Orchestrate status */}
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1e1e1e] border border-[#2e2e2e] text-[11px]">
            {orchestrateStatus === 'checking' ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-[#525252]" />
                <span className="text-[#525252]">Checking…</span>
              </>
            ) : orchestrateStatus === 'connected' ? (
              <>
                <CheckCircle className="w-3 h-3 text-[#24a148]" />
                <span className="text-[#24a148]">Orchestrate</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-3 h-3 text-[#f1c21b]" />
                <span className="text-[#f1c21b]">Offline</span>
              </>
            )}
          </div>

          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] text-[#8d8d8d] hover:text-white hover:bg-[#262626] transition-colors border border-transparent hover:border-[#393939]"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span className="hidden sm:block">Open IDE</span>
          </button>

          {user && (
            <div className="flex items-center gap-2 pl-3 border-l border-[#262626]">
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-full bg-[#0f62fe]/20 border border-[#0f62fe]/30 flex items-center justify-center">
                  <span className="text-[10px] font-bold text-[#4589ff]">
                    {user.name?.charAt(0).toUpperCase() ?? 'U'}
                  </span>
                </div>
                <span className="text-[12px] text-[#a8a8a8] hidden sm:block">{user.name}</span>
              </div>
              <button
                type="button"
                onClick={() => { logout(); router.push('/workspace'); }}
                className="p-1.5 rounded-lg hover:bg-[#262626] text-[#525252] hover:text-white transition-colors"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        {/* ── Hero ───────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-bold text-white tracking-tight">Workspaces</h1>
            <p className="text-[13px] text-[#6f6f6f] mt-1">
              Select a project to open in the ARIA coding agent
            </p>
          </div>
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#0f62fe] text-white rounded-xl text-[13px] font-medium hover:bg-[#0353e9] transition-colors shadow-lg shadow-[#0f62fe]/20"
          >
            <Plus className="w-4 h-4" />
            New Workspace
          </motion.button>
        </div>

        {/* ── Search ─────────────────────────────────────────────────── */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#525252]" />
          <input
            type="search"
            placeholder="Search workspaces…"
            className="w-full pl-10 pr-4 py-2.5 bg-[#1a1a1a] border border-[#262626] rounded-xl text-[13px] text-white focus:outline-none focus:border-[#0f62fe]/50 transition-colors placeholder:text-[#3d3d3d]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* ── Content ────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#0f62fe] flex items-center justify-center animate-pulse">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <p className="text-[12px] text-[#525252]">Loading workspaces…</p>
            </div>
          </div>
        ) : (
          <div className="space-y-8">
            <AnimatePresence>
              {/* Pinned */}
              {pinned.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                  <h2 className="text-[11px] font-semibold uppercase tracking-widest text-[#525252] flex items-center gap-2">
                    <Pin className="w-3 h-3" /> Pinned
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {pinned.map((ws) => (
                      <WorkspaceCard
                        key={ws.id}
                        workspace={ws}
                        onOpen={openWorkspace}
                        onDelete={deleteWorkspace}
                        onPin={pinWorkspace}
                      />
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Recent */}
              {recent.length > 0 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                  <h2 className="text-[11px] font-semibold uppercase tracking-widest text-[#525252] flex items-center gap-2">
                    <Clock className="w-3 h-3" /> Recent
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {recent.map((ws) => (
                      <WorkspaceCard
                        key={ws.id}
                        workspace={ws}
                        onOpen={openWorkspace}
                        onDelete={deleteWorkspace}
                        onPin={pinWorkspace}
                      />
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Empty state */}
              {filtered.length === 0 && !loading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-24 space-y-5"
                >
                  <div className="w-20 h-20 mx-auto rounded-2xl bg-[#0f62fe]/8 border border-[#0f62fe]/15 flex items-center justify-center">
                    <Zap className="w-9 h-9 text-[#4589ff]/50" />
                  </div>
                  <div>
                    <p className="font-semibold text-white text-[16px]">No workspaces yet</p>
                    <p className="text-[13px] text-[#525252] mt-1">
                      Create your first workspace to start coding with ARIA
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowCreate(true)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0f62fe] text-white rounded-xl text-[13px] font-medium hover:bg-[#0353e9] transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Create Workspace
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {showCreate && (
        <CreateWorkspaceModal
          onClose={() => setShowCreate(false)}
          onCreate={(ws) => {
            setWorkspaces((prev) => [ws, ...prev]);
            setShowCreate(false);
            openWorkspace(ws.id);
          }}
        />
      )}
    </div>
  );
}

function WorkspaceCard({
  workspace,
  onOpen,
  onDelete,
  onPin,
}: {
  workspace: Workspace;
  onOpen: (id: string) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  onPin: (id: string, pinned: boolean, e: React.MouseEvent) => void;
}) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -1 }}
      transition={{ duration: 0.15 }}
      className="cursor-pointer bg-[#1a1a1a] border border-[#262626] rounded-xl p-4 hover:border-[#0f62fe]/30 transition-all group relative overflow-hidden"
      onClick={() => onOpen(workspace.id)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-8 h-8 rounded-lg bg-[#0f62fe]/10 border border-[#0f62fe]/15 flex items-center justify-center">
          <FolderOpen className="w-4 h-4 text-[#4589ff]" />
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => onPin(workspace.id, workspace.isPinned, e)}
            className="p-1.5 hover:bg-[#262626] rounded-lg transition-colors"
            title={workspace.isPinned ? 'Unpin' : 'Pin'}
          >
            <Pin className={`w-3.5 h-3.5 ${workspace.isPinned ? 'text-[#4589ff]' : 'text-[#525252]'}`} />
          </button>
          <button
            type="button"
            onClick={(e) => onDelete(workspace.id, e)}
            className="p-1.5 hover:bg-red-900/15 rounded-lg transition-colors"
            title="Delete workspace"
          >
            <Trash2 className="w-3.5 h-3.5 text-[#525252] hover:text-red-400 transition-colors" />
          </button>
        </div>
      </div>

      <h3 className="font-semibold text-[13px] text-white truncate mb-1">{workspace.name}</h3>
      {workspace.description && (
        <p className="text-[11px] text-[#525252] truncate mb-3">{workspace.description}</p>
      )}

      <div className="flex items-center gap-3 text-[11px] text-[#525252]">
        {workspace.gitBranch && (
          <span className="flex items-center gap-1">
            <GitBranch className="w-3 h-3" />
            <span className="truncate max-w-[80px]">{workspace.gitBranch}</span>
          </span>
        )}
        {workspace.lastOpenedAt && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDistanceToNow(new Date(workspace.lastOpenedAt), { addSuffix: true })}
          </span>
        )}
      </div>

      {workspace.gitUrl && (
        <div className="flex items-center gap-1 mt-2 text-[10px] text-[#3d3d3d] truncate">
          <ExternalLink className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{workspace.gitUrl}</span>
        </div>
      )}

      <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <ChevronRight className="w-4 h-4 text-[#4589ff]" />
      </div>
    </motion.div>
  );
}
