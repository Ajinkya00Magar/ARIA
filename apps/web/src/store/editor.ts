import { create } from 'zustand';

export interface EditorFile {
  path: string;
  name: string;
  content: string;
  language?: string;
}

interface EditorState {
  activeFile: string | null;
  openFiles: EditorFile[];
  updateFileContent: (path: string, content: string) => void;
  openFile: (file: EditorFile) => void;
  closeFile: (path: string) => void;
  setActiveFile: (path: string) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  activeFile: null,
  openFiles: [],
  updateFileContent: (path, content) =>
    set((state) => ({
      openFiles: state.openFiles.map((f) =>
        f.path === path ? { ...f, content } : f
      ),
    })),
  openFile: (file) =>
    set((state) => {
      const exists = state.openFiles.some((f) => f.path === file.path);
      if (exists) {
        return { activeFile: file.path };
      }
      return {
        openFiles: [...state.openFiles, file],
        activeFile: file.path,
      };
    }),
  closeFile: (path) =>
    set((state) => {
      const newFiles = state.openFiles.filter((f) => f.path !== path);
      return {
        openFiles: newFiles,
        activeFile: state.activeFile === path ? (newFiles[0]?.path ?? null) : state.activeFile,
      };
    }),
  setActiveFile: (path) => set({ activeFile: path }),
}));
