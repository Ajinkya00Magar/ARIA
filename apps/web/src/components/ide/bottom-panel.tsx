'use client';

import { useState, useEffect, useRef } from 'react';
import { Terminal as TermIcon, AlertCircle, FileText, Plus, X, ChevronRight } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';

const IntegratedTerminal = dynamic(
  () => import('@/components/terminal/integrated-terminal').then((m) => m.IntegratedTerminal),
  { ssr: false, loading: () => <div className="p-4 text-xs text-muted-foreground">Loading terminal...</div> }
);

interface BottomPanelProps {
  activePanel: 'terminal' | 'output' | 'problems';
  onChangePanel: (p: 'terminal' | 'output' | 'problems') => void;
  onClose: () => void;
}

export function BottomPanel({ activePanel, onChangePanel, onClose }: BottomPanelProps) {
  const { currentWorkspace } = useWorkspaceStore();
  const TABS: { id: 'terminal' | 'output' | 'problems'; label: string; icon: React.FC<any> }[] = [
    { id: 'terminal', label: 'Terminal', icon: TermIcon },
    { id: 'problems', label: 'Problems', icon: AlertCircle },
    { id: 'output', label: 'Output', icon: FileText },
  ];

  return (
    <div className="flex flex-col h-full bg-[#161616] border-t border-[#393939]">
      {/* Tab Bar */}
      <div className="flex items-center border-b border-[#393939] bg-[#1e1e1e] shrink-0">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => onChangePanel(id)}
            className={cn(
              'flex items-center gap-1.5 px-4 py-1.5 text-xs border-b-2 transition-colors',
              activePanel === id
                ? 'border-[#4589ff] text-[#4589ff] bg-[#161616]'
                : 'border-transparent text-[#8d8d8d] hover:text-[#c6c6c6] hover:bg-[#262626]',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        ))}

        {/* New terminal button */}
        {activePanel === 'terminal' && (
          <button
            type="button"
            className="ml-2 p-1 text-[#8d8d8d] hover:text-white rounded hover:bg-[#393939] transition-colors"
            title="New Terminal"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="ml-auto mr-2 p-1 text-[#8d8d8d] hover:text-white rounded hover:bg-[#393939] transition-colors"
          title="Close Panel"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Panel Content */}
      <div className="flex-1 overflow-hidden">
        {activePanel === 'terminal' && <IntegratedTerminal workspacePath={currentWorkspace?.path || process.cwd()} />}
        {activePanel === 'problems' && <ProblemsPanel />}
        {activePanel === 'output' && <OutputPanel />}
      </div>
    </div>
  );
}

// ── Inline Terminal ────────────────────────────────────────────────────────────

interface TermSession {
  id: string;
  name: string;
  output: string[];
}

function InlineTerminal() {
  const [sessions, setSessions] = useState<TermSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [running, setRunning] = useState(false);
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { currentWorkspace } = useWorkspaceStore();

  const activeSession = sessions.find((s) => s.id === activeId);

  // Auto scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [activeSession?.output]);

  useEffect(() => {
    async function loadSessions() {
      if (!currentWorkspace) return;
      try {
        const res = await apiClient.get<{ data: TermSession[] }>(
          `/terminal/${currentWorkspace.id}/sessions`,
        );
        let loaded = res.data.data;
        if (loaded.length === 0) {
          const cr = await apiClient.post<{ data: TermSession }>(
            `/terminal/${currentWorkspace.id}/sessions`,
            { name: 'Terminal 1' },
          );
          loaded = [cr.data.data];
        }
        setSessions(loaded);
        setActiveId(loaded[0].id);
      } catch {
        // no workspace or endpoint not ready
      }
    }
    void loadSessions();
  }, [currentWorkspace]);

  const runCommand = async () => {
    const cmd = input.trim();
    if (!cmd || !currentWorkspace || !activeId || running) return;
    setInput('');
    setHistory((h) => [cmd, ...h].slice(0, 50));
    setHistoryIdx(-1);
    setRunning(true);

    // Append command line immediately
    const cmdLine = `$ ${cmd}`;
    setSessions((prev) =>
      prev.map((s) =>
        s.id === activeId ? { ...s, output: [...(s.output ?? []), cmdLine] } : s,
      ),
    );

    try {
      const res = await apiClient.post<{ data: { stdout: string; stderr: string; exitCode: number } }>(
        `/terminal/${currentWorkspace.id}/exec`,
        { command: cmd },
      );
      const { stdout, stderr, exitCode } = res.data.data;
      const lines: string[] = [];
      if (stdout) lines.push(...stdout.split('\n').filter(Boolean));
      if (stderr) lines.push(...stderr.split('\n').filter(Boolean).map((l) => `\u001b[31m${l}\u001b[0m`));
      if (exitCode !== 0) lines.push(`\u001b[33mProcess exited with code ${exitCode}\u001b[0m`);

      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeId ? { ...s, output: [...(s.output ?? []), ...lines] } : s,
        ),
      );
    } catch {
      setSessions((prev) =>
        prev.map((s) =>
          s.id === activeId
            ? { ...s, output: [...(s.output ?? []), '\u001b[31mCommand failed\u001b[0m'] }
            : s,
        ),
      );
    } finally {
      setRunning(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void runCommand();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(historyIdx + 1, history.length - 1);
      setHistoryIdx(next);
      if (history[next]) setInput(history[next]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = Math.max(historyIdx - 1, -1);
      setHistoryIdx(next);
      setInput(next === -1 ? '' : history[next] ?? '');
    }
  };

  if (!currentWorkspace) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-[#8d8d8d] text-xs gap-2">
        <TermIcon className="h-8 w-8 opacity-30" />
        <p>Open a workspace to use the terminal</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#0e0e0e]">
      {/* Session tabs */}
      {sessions.length > 1 && (
        <div className="flex items-center gap-1 px-2 pt-1 shrink-0">
          {sessions.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveId(s.id)}
              className={cn(
                'flex items-center gap-1 px-2 py-0.5 rounded text-xs',
                activeId === s.id
                  ? 'bg-[#262626] text-white'
                  : 'text-[#8d8d8d] hover:text-white',
              )}
            >
              <TermIcon className="h-3 w-3" />
              {s.name}
            </button>
          ))}
        </div>
      )}

      {/* Output */}
      <div
        ref={outputRef}
        className="flex-1 overflow-y-auto p-3 font-mono text-xs text-[#a8a8a8] leading-5"
        onClick={() => inputRef.current?.focus()}
      >
        {(activeSession?.output ?? []).map((line, i) => (
          <div key={i} className="whitespace-pre-wrap break-all">
            {line.startsWith('$') ? (
              <span>
                <span className="text-[#42be65]">{line.slice(0, 1)}</span>
                <span className="text-[#c6c6c6]">{line.slice(1)}</span>
              </span>
            ) : (
              <AnsiLine text={line} />
            )}
          </div>
        ))}

        {/* Active input line */}
        <div className="flex items-center gap-1 mt-1">
          <span className="text-[#42be65]">$</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={running}
            className="flex-1 bg-transparent text-[#f4f4f4] font-mono text-xs focus:outline-none caret-[#4589ff]"
            autoFocus
            autoComplete="off"
            spellCheck={false}
          />
          {running && (
            <span className="text-[#8d8d8d] text-[10px] animate-pulse">running…</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── ANSI color renderer (simplified) ──────────────────────────────────────────

function AnsiLine({ text }: { text: string }) {
  // Strip ANSI codes for now — a full parser would use a library
  const clean = text.replace(/\u001b\[[0-9;]*m/g, '');
  const isError = text.includes('\u001b[31m');
  const isWarning = text.includes('\u001b[33m');

  return (
    <span className={cn(
      isError && 'text-[#ff8389]',
      isWarning && 'text-[#f1c21b]',
      !isError && !isWarning && 'text-[#a8a8a8]',
    )}>
      {clean}
    </span>
  );
}

// ── Problems Panel ─────────────────────────────────────────────────────────────

function ProblemsPanel() {
  return (
    <div className="flex flex-col h-full items-center justify-center text-[#8d8d8d] text-xs gap-2">
      <AlertCircle className="h-8 w-8 opacity-30" />
      <p>No problems detected</p>
    </div>
  );
}

// ── Output Panel ───────────────────────────────────────────────────────────────

function OutputPanel() {
  return (
    <div className="flex flex-col h-full p-3 font-mono text-xs text-[#8d8d8d]">
      <p className="text-[#4589ff]">IBM Coding Agent — Output</p>
      <p className="mt-1">Agent ready. Start a chat to see output here.</p>
    </div>
  );
}
