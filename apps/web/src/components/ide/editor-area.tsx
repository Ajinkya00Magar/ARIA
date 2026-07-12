'use client';

import dynamic from 'next/dynamic';
import { X, Circle, Code2 } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { cn } from '@/lib/utils';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-[#1e1e1e]">
      <div className="text-[#8d8d8d] text-sm animate-pulse">Loading editor…</div>
    </div>
  ),
});

export function EditorArea() {
  const { openFiles, activeFileIndex, closeFile, setActiveFile, updateFileContent, currentWorkspace } =
    useWorkspaceStore();

  const activeFile = openFiles[activeFileIndex];

  const handleSave = async () => {
    if (!activeFile || !currentWorkspace) return;
    try {
      await apiClient.post(`/files/${currentWorkspace.id}/write`, {
        path: activeFile.path,
        content: activeFile.content,
      });
      toast.success(`Saved ${activeFile.name}`);
    } catch {
      toast.error('Failed to save file');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      void handleSave();
    }
  };

  if (openFiles.length === 0) {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-[#161616] gap-4">
        {/* IBM-styled welcome */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-[#0f62fe]/10 border border-[#0f62fe]/20 flex items-center justify-center">
            <Code2 className="h-8 w-8 text-[#4589ff] opacity-60" />
          </div>
          <div>
            <p className="text-[#c6c6c6] text-sm font-medium">No file open</p>
            <p className="text-[#8d8d8d] text-xs mt-1">
              Select a file from the Explorer, or ask the AI agent to create one
            </p>
          </div>
          <div className="flex flex-col gap-2 text-xs text-[#8d8d8d] mt-4">
            <p><span className="font-mono bg-[#262626] px-1.5 py-0.5 rounded text-[#4589ff]">Ctrl+B</span> — Toggle Explorer</p>
            <p><span className="font-mono bg-[#262626] px-1.5 py-0.5 rounded text-[#4589ff]">Ctrl+`</span> — Open Terminal</p>
            <p><span className="font-mono bg-[#262626] px-1.5 py-0.5 rounded text-[#4589ff]">Ctrl+J</span> — Toggle Bottom Panel</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" onKeyDown={handleKeyDown}>
      {/* ── Tab Bar ────────────────────────────────────────────────────────── */}
      <div className="flex items-center overflow-x-auto border-b border-[#393939] bg-[#1e1e1e] shrink-0 hide-scrollbar">
        {openFiles.map((file, idx) => (
          <div
            key={file.path}
            onClick={() => setActiveFile(idx)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 border-r border-[#393939] cursor-pointer text-xs whitespace-nowrap group transition-colors min-w-0 relative',
              idx === activeFileIndex
                ? 'bg-[#161616] text-[#f4f4f4]'
                : 'text-[#8d8d8d] hover:text-[#c6c6c6] hover:bg-[#262626]',
            )}
          >
            {/* Active tab top indicator */}
            {idx === activeFileIndex && (
              <div className="absolute top-0 left-0 right-0 h-px bg-[#4589ff]" />
            )}

            {file.isDirty && (
              <Circle className="h-2 w-2 fill-[#4589ff] text-[#4589ff] shrink-0" />
            )}
            <span className="truncate max-w-[120px]">{file.name}</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                closeFile(file.path);
              }}
              className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-opacity ml-1 shrink-0 rounded p-0.5 hover:bg-[#393939]"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>

      {/* ── Monaco Editor ─────────────────────────────────────────────────── */}
      {activeFile && (
        <div className="flex-1 overflow-hidden">
          <MonacoEditor
            height="100%"
            language={activeFile.language}
            value={activeFile.content}
            theme="vs-dark"
            onChange={(value) => updateFileContent(activeFile.path, value ?? '')}
            options={{
              fontSize: 14,
              fontFamily: "'IBM Plex Mono', 'Cascadia Code', 'Fira Code', monospace",
              fontLigatures: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              lineNumbers: 'on',
              renderWhitespace: 'none',
              tabSize: 2,
              wordWrap: 'off',
              automaticLayout: true,
              padding: { top: 12, bottom: 12 },
              cursorStyle: 'line',
              smoothScrolling: true,
              cursorBlinking: 'smooth',
              bracketPairColorization: { enabled: true },
              guides: { bracketPairs: true },
              renderLineHighlight: 'gutter',
              scrollbar: { vertical: 'auto', horizontal: 'auto', verticalScrollbarSize: 6, horizontalScrollbarSize: 6 },
            }}
          />
        </div>
      )}
    </div>
  );
}
