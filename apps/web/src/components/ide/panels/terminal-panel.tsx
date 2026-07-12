'use client';

import { useState, useEffect } from 'react';
import { Terminal as TermIcon, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';

interface TermSession {
  id: string;
  name: string;
  output: string[];
}

export function TerminalPanel() {
  const [sessions, setSessions] = useState<TermSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const { currentWorkspace } = useWorkspaceStore();

  const activeSession = sessions.find((s) => s.id === activeId);

  useEffect(() => {
    async function loadSessions() {
      if (!currentWorkspace) return;
      try {
        const res = await apiClient.get<{ data: TermSession[] }>(`/terminal/${currentWorkspace.id}/sessions`);
        let loaded = res.data.data;
        if (loaded.length === 0) {
          const createRes = await apiClient.post<{ data: TermSession }>(`/terminal/${currentWorkspace.id}/sessions`, { name: 'Terminal 1' });
          loaded = [createRes.data.data];
        }
        setSessions(loaded);
        setActiveId(loaded[0].id);
      } catch (err) {
        toast.error('Failed to load terminal sessions');
      }
    }
    void loadSessions();
  }, [currentWorkspace]);

  const createSession = async () => {
    if (!currentWorkspace) return;
    try {
      const name = `Terminal ${sessions.length + 1}`;
      const res = await apiClient.post<{ data: TermSession }>(`/terminal/${currentWorkspace.id}/sessions`, { name });
      const newSession = res.data.data;
      setSessions((prev) => [...prev, newSession]);
      setActiveId(newSession.id);
    } catch (err) {
      toast.error('Failed to create terminal session');
    }
  };

  const runCommand = async () => {
    if (!input.trim() || !currentWorkspace || !activeId) return;
    const cmd = input;
    setInput('');
    let newOutput: string[] = [];
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id === activeId) {
          newOutput = [...(s.output || []), `$ ${cmd}`];
          return { ...s, output: newOutput };
        }
        return s;
      }),
    );

    try {
      const res = await apiClient.post<{ data: { stdout: string; stderr: string; exitCode: number } }>(
        `/terminal/${currentWorkspace.id}/exec`,
        { command: cmd },
      );
      const { stdout, stderr, exitCode } = res.data.data;
      const lines: string[] = [];
      if (stdout) lines.push(...stdout.split('\n'));
      if (stderr) lines.push(...stderr.split('\n').map((l) => `\x1b[31m${l}\x1b[0m`));
      if (exitCode !== 0) lines.push(`Exit code: ${exitCode}`);
      
      newOutput = [...newOutput, ...lines];
      setSessions((prev) =>
        prev.map((s) => (s.id === activeId ? { ...s, output: newOutput } : s)),
      );

      // Persist to backend
      await apiClient.put(`/terminal/${currentWorkspace.id}/sessions/${activeId}/output`, { output: newOutput });
    } catch {
      toast.error('Command failed');
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-2 py-1 border-b border-border shrink-0 overflow-x-auto">
        {sessions.map((s) => (
          <button
            key={s.id}
            onClick={() => setActiveId(s.id)}
            className={cn(
              'flex items-center gap-1.5 px-2.5 py-1 rounded text-xs whitespace-nowrap',
              activeId === s.id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <TermIcon className="h-3 w-3" />
            {s.name}
          </button>
        ))}
        <button
          onClick={createSession}
          className="p-1 text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Output */}
      <div className="flex-1 overflow-y-auto p-2 font-mono text-xs text-green-300 bg-black/20">
        {(activeSession?.output || []).map((line, i) => (
          <div key={i} className="leading-5 whitespace-pre-wrap break-all">
            {line}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 px-2 py-1.5 border-t border-border shrink-0">
        <span className="text-green-400 text-xs font-mono">$</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && runCommand()}
          placeholder="Enter command…"
          className="flex-1 bg-transparent font-mono text-xs focus:outline-none text-foreground placeholder:text-muted-foreground/50"
        />
      </div>
    </div>
  );
}
