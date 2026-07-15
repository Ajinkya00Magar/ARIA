'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FolderOpen, Plus, GitBranch, Clock, Pin, Trash2,
  Code2, Settings, LogOut, Search, ExternalLink, Loader2,
  ChevronRight, Sparkles, Terminal, Cpu,
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
  }, [fetchWorkspaces]);

  const openWorkspace = (id: string) => {
    router.push(`/workspace/app?id=${id}`);
  };

  const deleteWorkspace = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Remove this folder from recent workspaces? The folder and its files will not be deleted.')) return;
    try {
      await apiClient.delete(`/workspaces/${id}`);
      setWorkspaces((prev) => prev.filter((w) => w.id !== id));
      toast.success('Folder removed from recents');
    } catch {
      toast.error('Remove failed');
    }
  };

  const pinWorkspace = async (id: string, pinned: boolean, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await apiClient.post(`/workspaces/${id}/pin`, { pin: !pinned });
      setWorkspaces((prev) =>
        prev.map((w) => (w.id === id ? { ...w, isPinned: !pinned } : w)),
      );
    } catch {
      toast.error('Failed to pin workspace');
    }
  };

  const filtered = workspaces.filter((w) =>
    w.name.toLowerCase().includes(search.toLowerCase()),
  );

  const pinned = filtered.filter((w) => w.isPinned);
  const recent = filtered.filter((w) => !w.isPinned);

  return (
    <div className="min-h-screen bg-[#161616] text-[#f4f4f4]">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="border-b border-[#393939] px-6 py-3 flex items-center justify-between bg-[#1e1e1e]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#0f62fe] flex items-center justify-center shadow-lg shadow-[#0f62fe]/20">
            <Code2 className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <span className="font-semibold text-sm text-white">IBM Coding Agent</span>
            <p className="text-[10px] text-[#8d8d8d] leading-none">Powered by IBM Orchestrate</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-[#8d8d8d] hover:text-white hover:bg-[#393939] transition-colors"
          >
            <Terminal className="w-3.5 h-3.5" />
            <span className="hidden sm:block">IDE</span>
          </button>
          {user && (
            <div className="flex items-center gap-2 pl-2 border-l border-[#393939]">
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 rounded-full bg-[#0f62fe]/30 border border-[#0f62fe]/40 flex items-center justify-center">
                  <span className="text-[10px] font-semibold text-[#4589ff]">
                    {user.name?.charAt(0).toUpperCase() ?? 'U'}
                  </span>
                </div>
                <span className="text-xs text-[#a8a8a8] hidden sm:block">{user.name}</span>
              </div>
              <button
                type="button"
                onClick={() => { logout(); router.push('/workspace'); }}
                className="p-1.5 rounded hover:bg-[#393939] text-[#8d8d8d] hover:text-white transition-colors"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-10 space-y-8">
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">Workspaces</h1>
            <p className="text-[#8d8d8d] mt-1 text-sm">
              Select a project to open in the IBM Coding Agent IDE
            </p>
          </div>
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#0f62fe] text-white rounded-lg text-sm font-medium hover:bg-[#0353e9] transition-colors shadow-lg shadow-[#0f62fe]/20"
          >
            <Plus className="w-4 h-4" />
            Open Folder
          </motion.button>
        </div>

        {/* ── Search ───────────────────────────────────────────────────────── */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8d8d8d]" />
          <input
            type="search"
            placeholder="Search recent folders…"
            className="w-full pl-10 pr-4 py-2.5 bg-[#262626] border border-[#393939] rounded-lg text-sm text-white focus:outline-none focus:border-[#0f62fe] transition-colors placeholder:text-[#6f6f6f]"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* ── Content ──────────────────────────────────────────────────────── */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-[#4589ff]" />
              <p className="text-xs text-[#8d8d8d]">Loading workspaces…</p>
            </div>
          </div>
        ) : (
          <AnimatePresence>
            {/* Pinned */}
            {pinned.length > 0 && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-[#8d8d8d] flex items-center gap-2">
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
                <h2 className="text-xs font-semibold uppercase tracking-widest text-[#8d8d8d] flex items-center gap-2">
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
                <div className="w-20 h-20 mx-auto rounded-2xl bg-[#0f62fe]/10 border border-[#0f62fe]/20 flex items-center justify-center">
                  <Sparkles className="w-9 h-9 text-[#4589ff] opacity-60" />
                </div>
                <div>
                  <p className="font-semibold text-white text-lg">No folders opened yet</p>
                  <p className="text-sm text-[#8d8d8d] mt-1">
                    Create your first workspace to start coding with the IBM agent
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#0f62fe] text-white rounded-lg text-sm font-medium hover:bg-[#0353e9] transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Create Workspace
                </button>
              </motion.div>
            )}
          </AnimatePresence>
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

// ── Workspace Card ─────────────────────────────────────────────────────────────

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
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -2 }}
      className="cursor-pointer bg-[#262626] border border-[#393939] rounded-xl p-4 hover:border-[#0f62fe]/50 transition-all group relative overflow-hidden"
      onClick={() => onOpen(workspace.id)}
    >
      {/* Background accent */}
      <div className="absolute top-0 right-0 w-24 h-24 bg-[#0f62fe]/5 rounded-full -translate-y-12 translate-x-12 group-hover:bg-[#0f62fe]/10 transition-colors" />

      <div className="flex items-start justify-between mb-4 relative">
        <div className="w-9 h-9 rounded-lg bg-[#0f62fe]/15 border border-[#0f62fe]/20 flex items-center justify-center">
          <FolderOpen className="w-4.5 h-4.5 text-[#4589ff]" />
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            type="button"
            onClick={(e) => onPin(workspace.id, workspace.isPinned, e)}
            className="p-1.5 hover:bg-[#393939] rounded transition-colors"
            title={workspace.isPinned ? 'Unpin' : 'Pin'}
          >
            <Pin
              className={`w-3.5 h-3.5 ${workspace.isPinned ? 'text-[#4589ff] fill-[#4589ff]' : 'text-[#8d8d8d]'}`}
            />
          </button>
          <button
            type="button"
            onClick={(e) => onDelete(workspace.id, e)}
            className="p-1.5 hover:bg-red-900/20 rounded transition-colors"
            title="Delete workspace"
          >
            <Trash2 className="w-3.5 h-3.5 text-[#8d8d8d] hover:text-red-400" />
          </button>
        </div>
      </div>

      <h3 className="font-semibold text-sm text-white truncate mb-1">{workspace.name}</h3>
      {workspace.description && (
        <p className="text-xs text-[#8d8d8d] truncate mb-3">{workspace.description}</p>
      )}

      <div className="flex items-center gap-3 text-xs text-[#8d8d8d]">
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
        <div className="flex items-center gap-1 mt-2 text-xs text-[#8d8d8d] truncate">
          <ExternalLink className="w-3 h-3 flex-shrink-0" />
          <span className="truncate">{workspace.gitUrl}</span>
        </div>
      )}

      {/* Open arrow */}
      <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <ChevronRight className="w-4 h-4 text-[#4589ff]" />
      </div>
    </motion.div>
  );
}
