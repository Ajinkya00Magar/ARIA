// ─────────────────────────────────────────────────────────────────────────────
// Monaco Editor Component
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import { useRef, useCallback, useEffect } from 'react';
import Editor, { OnMount, OnChange } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';
import { useEditorStore } from '@/store/editor';
import { apiClient } from '@/lib/api-client';
import { useToast } from '@/hooks/use-toast';
import { debounce } from '@ibm-agent/shared';

interface IDEEditorProps {
  workspaceId: string;
}

export function IDEEditor({ workspaceId }: IDEEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const { activeFile, openFiles, updateFileContent } = useEditorStore();
  const { toast } = useToast();

  const activeTab = openFiles.find((f) => f.path === activeFile);

  // Auto-save with debounce
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const autoSave = useCallback(
    debounce(((path: string, content: string) => {
      apiClient.post(`/files/${workspaceId}/write`, { path, content }).catch(() => {
        toast({ title: 'Auto-save failed', variant: 'destructive' });
      });
    }) as any, 1500) as (path: string, content: string) => void,
    [workspaceId, toast],
  );

  const handleMount: OnMount = (editorInstance, monaco) => {
    editorRef.current = editorInstance;

    // Key bindings
    editorInstance.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
      async () => {
        if (!activeFile || !activeTab) return;
        try {
          await apiClient.post(`/files/${workspaceId}/write`, {
            path: activeFile,
            content: editorInstance.getValue(),
          });
          toast({ title: 'File saved', description: activeFile });
        } catch {
          toast({ title: 'Save failed', variant: 'destructive' });
        }
      },
    );

    // Configure themes
    monaco.editor.defineTheme('ibm-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '6A737D', fontStyle: 'italic' },
        { token: 'keyword', foreground: '7BB3FF' },
        { token: 'string', foreground: '9ECE6A' },
        { token: 'number', foreground: 'FF9E64' },
        { token: 'type', foreground: 'BB9AF7' },
        { token: 'function', foreground: '7AA2F7' },
      ],
      colors: {
        'editor.background': '#0F1117',
        'editor.foreground': '#C8D3F5',
        'editorLineNumber.foreground': '#3B4261',
        'editorLineNumber.activeForeground': '#787C99',
        'editor.selectionBackground': '#2D3F76',
        'editor.lineHighlightBackground': '#1A1B26',
        'editorCursor.foreground': '#C0CAF5',
        'editor.findMatchBackground': '#3D59A1',
        'editorWidget.background': '#1A1B26',
        'editorWidget.border': '#292E42',
      },
    });

    monaco.editor.setTheme('ibm-dark');
  };

  const handleChange: OnChange = (value) => {
    if (!activeFile || value === undefined) return;
    updateFileContent(activeFile, value);
    autoSave(activeFile, value);
  };

  if (!activeFile || !activeTab) {
    return (
      <div className="flex items-center justify-center h-full bg-background text-muted-foreground text-sm">
        <div className="text-center space-y-3">
          <div className="text-4xl font-mono text-muted-foreground/20">{'{ }'}</div>
          <p>Select a file to start editing</p>
          <p className="text-xs">Or ask the AI agent to create one</p>
        </div>
      </div>
    );
  }

  return (
    <Editor
      height="100%"
      path={activeFile}
      language={activeTab.language ?? 'plaintext'}
      value={activeTab.content ?? ''}
      onChange={handleChange}
      onMount={handleMount}
      options={{
        fontSize: 14,
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
        fontLigatures: true,
        lineNumbers: 'on',
        minimap: { enabled: true, scale: 1 },
        scrollBeyondLastLine: false,
        wordWrap: 'off',
        tabSize: 2,
        insertSpaces: true,
        automaticLayout: true,
        formatOnPaste: true,
        formatOnType: false,
        bracketPairColorization: { enabled: true },
        guides: { bracketPairs: true, indentation: true },
        suggest: { insertMode: 'replace' },
        quickSuggestions: { other: true, comments: false, strings: false },
        parameterHints: { enabled: true },
        autoClosingBrackets: 'always',
        autoClosingQuotes: 'always',
        renderWhitespace: 'selection',
        smoothScrolling: true,
        cursorSmoothCaretAnimation: 'on',
        stickyScroll: { enabled: true },
      }}
      theme="ibm-dark"
    />
  );
}
