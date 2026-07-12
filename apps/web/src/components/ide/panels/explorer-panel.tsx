'use client';

import { useState, useCallback } from 'react';
import {
  ChevronRight, ChevronDown, File, Folder, FolderOpen,
  Plus, RefreshCw, FileCode, FileCog, FileText, FileJson,
  MoreHorizontal,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { apiClient } from '@/lib/api-client';
import { getLanguageFromExtension, getFileExtension } from '@ibm-agent/shared';
import type { WorkspaceFile } from '@ibm-agent/types';

export function ExplorerPanel() {
  const { currentWorkspace, fileTree, setFileTree, openFile, expandedFolders, toggleFolder } =
    useWorkspaceStore();

  const { isLoading, refetch } = useQuery({
    queryKey: ['file-tree', currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace) return [];
      const res = await apiClient.get<{ data: WorkspaceFile[] }>(
        `/files/${currentWorkspace.id}/list`,
        { params: { path: '.' } },
      );
      setFileTree(res.data.data);
      return res.data.data;
    },
    enabled: !!currentWorkspace,
  });

  const handleOpenFile = useCallback(
    async (file: WorkspaceFile) => {
      if (file.type === 'directory') {
        toggleFolder(file.path);
        return;
      }
      if (!currentWorkspace) return;

      try {
        const res = await apiClient.get<{ data: { content: string } }>(
          `/files/${currentWorkspace.id}/read`,
          { params: { path: file.path } },
        );
        const ext = getFileExtension(file.name);
        openFile({
          path: file.path,
          name: file.name,
          content: res.data.data.content,
          language: getLanguageFromExtension(ext),
          isDirty: false,
          originalContent: res.data.data.content,
        });
      } catch (err) {
        console.error('Failed to open file', err);
      }
    },
    [currentWorkspace, openFile, toggleFolder],
  );

  if (!currentWorkspace) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-3 p-6">
        <Folder className="h-12 w-12 text-[#525252]" />
        <p className="text-sm text-[#8d8d8d] text-center">No workspace open</p>
        <p className="text-xs text-[#6f6f6f] text-center">
          Open a workspace from the Workspaces page to browse files
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[#1e1e1e]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#393939] shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-[#8d8d8d] truncate">
          {currentWorkspace.name}
        </span>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => void refetch()}
            title="Refresh"
            className="p-1 rounded hover:bg-[#393939] text-[#8d8d8d] hover:text-white transition-colors"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          </button>
          <button
            type="button"
            title="New File"
            className="p-1 rounded hover:bg-[#393939] text-[#8d8d8d] hover:text-white transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            title="More actions"
            className="p-1 rounded hover:bg-[#393939] text-[#8d8d8d] hover:text-white transition-colors"
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1">
        {isLoading ? (
          <div className="px-4 py-2 text-xs text-[#8d8d8d] animate-pulse">Loading files…</div>
        ) : fileTree.length === 0 ? (
          <div className="px-4 py-4 text-xs text-[#8d8d8d]">No files in workspace</div>
        ) : (
          <FileTree files={fileTree} depth={0} onOpen={handleOpenFile} expandedFolders={expandedFolders} />
        )}
      </div>
    </div>
  );
}

function FileTree({
  files,
  depth,
  onOpen,
  expandedFolders,
}: {
  files: WorkspaceFile[];
  depth: number;
  onOpen: (f: WorkspaceFile) => void;
  expandedFolders: Set<string>;
}) {
  return (
    <>
      {files.map((file) => (
        <FileTreeItem
          key={file.path}
          file={file}
          depth={depth}
          onOpen={onOpen}
          expandedFolders={expandedFolders}
        />
      ))}
    </>
  );
}

function FileTreeItem({
  file,
  depth,
  onOpen,
  expandedFolders,
}: {
  file: WorkspaceFile;
  depth: number;
  onOpen: (f: WorkspaceFile) => void;
  expandedFolders: Set<string>;
}) {
  const isExpanded = expandedFolders.has(file.path);
  const isDir = file.type === 'directory';
  const ext = getFileExtension(file.name);
  const lang = getLanguageFromExtension(ext);

  const FileIcon = isDir
    ? isExpanded ? FolderOpen : Folder
    : getFileIcon(lang);

  const fileColor = isDir
    ? 'text-[#f1c21b]'
    : FILE_COLORS[lang] ?? 'text-[#c6c6c6]';

  return (
    <>
      <button
        type="button"
        onClick={() => onOpen(file)}
        className={cn(
          'w-full flex items-center gap-1.5 py-0.5 text-sm hover:bg-[#262626] transition-colors group text-left',
          isDir ? 'text-[#c6c6c6]' : fileColor,
        )}
        style={{ paddingLeft: `${8 + depth * 14}px`, paddingRight: '8px' }}
      >
        {isDir ? (
          <>
            {isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-[#8d8d8d] shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-[#8d8d8d] shrink-0" />
            )}
            <FileIcon className={cn('h-3.5 w-3.5 shrink-0', fileColor)} />
          </>
        ) : (
          <>
            <span className="w-3.5 shrink-0" />
            <FileIcon className={cn('h-3.5 w-3.5 shrink-0', fileColor)} />
          </>
        )}
        <span className="truncate text-xs">{file.name}</span>
      </button>

      {isDir && isExpanded && file.children && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
          >
            <FileTree
              files={file.children}
              depth={depth + 1}
              onOpen={onOpen}
              expandedFolders={expandedFolders}
            />
          </motion.div>
        </AnimatePresence>
      )}
    </>
  );
}

// ── File icon and color map ────────────────────────────────────────────────────

function getFileIcon(lang: string): React.FC<{ className?: string }> {
  if (['typescript', 'typescriptreact', 'javascript', 'javascriptreact', 'python', 'rust', 'go'].includes(lang)) {
    return FileCode;
  }
  if (['json', 'yaml'].includes(lang)) return FileJson;
  if (['toml', 'ini', 'dotenv'].includes(lang)) return FileCog;
  return FileText;
}

const FILE_COLORS: Record<string, string> = {
  typescript: 'text-[#4589ff]',
  typescriptreact: 'text-[#4589ff]',
  javascript: 'text-[#f1c21b]',
  javascriptreact: 'text-[#f1c21b]',
  python: 'text-[#42be65]',
  rust: 'text-[#ff832b]',
  go: 'text-[#08bdba]',
  json: 'text-[#f1c21b]',
  yaml: 'text-[#be95ff]',
  markdown: 'text-[#a8a8a8]',
  css: 'text-[#ee5396]',
  html: 'text-[#ff8389]',
  shell: 'text-[#42be65]',
  toml: 'text-[#be95ff]',
};
