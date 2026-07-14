// ─────────────────────────────────────────────────────────────────────────────
// workspace-store.ts — add setWorkspace alias
// ─────────────────────────────────────────────────────────────────────────────

import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Workspace, WorkspaceFile } from '@ibm-agent/types';

interface WorkspaceState {
  currentWorkspace: Workspace | null;
  openFiles: OpenFile[];
  activeFileIndex: number;
  fileTree: WorkspaceFile[];
  expandedFolders: Set<string>;

  setCurrentWorkspace: (ws: Workspace | null) => void;
  setWorkspace: (ws: Workspace | null) => void; // alias
  openFile: (file: OpenFile) => void;
  closeFile: (path: string) => void;
  setActiveFile: (index: number) => void;
  updateFileContent: (path: string, content: string) => void;
  setFileTree: (tree: WorkspaceFile[]) => void;
  toggleFolder: (path: string) => void;
}

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  language: string;
  isDirty: boolean;
  originalContent: string;
}

export const useWorkspaceStore = create<WorkspaceState>()(
  immer((set) => ({
    currentWorkspace: null,
    openFiles: [],
    activeFileIndex: -1,
    fileTree: [],
    expandedFolders: new Set<string>(),

    setCurrentWorkspace: (ws) =>
      set((state) => { state.currentWorkspace = ws; }),

    setWorkspace: (ws) =>
      set((state) => { state.currentWorkspace = ws; }),

    openFile: (file) =>
      set((state) => {
        const existingIdx = state.openFiles.findIndex((f) => f.path === file.path);
        if (existingIdx >= 0) {
          state.activeFileIndex = existingIdx;
        } else {
          state.openFiles.push(file);
          state.activeFileIndex = state.openFiles.length - 1;
        }
      }),

    closeFile: (path) =>
      set((state) => {
        const idx = state.openFiles.findIndex((f) => f.path === path);
        if (idx < 0) return;
        state.openFiles.splice(idx, 1);
        if (state.activeFileIndex >= state.openFiles.length) {
          state.activeFileIndex = state.openFiles.length - 1;
        }
      }),

    setActiveFile: (index) =>
      set((state) => { state.activeFileIndex = index; }),

    updateFileContent: (path, content) =>
      set((state) => {
        const file = state.openFiles.find((f) => f.path === path);
        if (file) {
          file.content = content;
          file.isDirty = content !== file.originalContent;
        }
      }),

    setFileTree: (tree) =>
      set((state) => { state.fileTree = tree; }),

    toggleFolder: (path) =>
      set((state) => {
        if (state.expandedFolders.has(path)) {
          state.expandedFolders.delete(path);
        } else {
          state.expandedFolders.add(path);
        }
      }),
  })),
);
