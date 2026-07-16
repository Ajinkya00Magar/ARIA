'use client';

import { useState, useEffect, useRef } from 'react';
import { Terminal as TermIcon, AlertCircle, FileText, Plus, X, ChevronRight } from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import dynamic from 'next/dynamic';



interface BottomPanelProps {
  activePanel: 'output' | 'problems';
  onChangePanel: (p: 'output' | 'problems') => void;
  onClose: () => void;
}

export function BottomPanel({ activePanel, onChangePanel, onClose }: BottomPanelProps) {
  const { currentWorkspace } = useWorkspaceStore();
  const TABS: { id: 'output' | 'problems'; label: string; icon: React.FC<any> }[] = [
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
        {activePanel === 'problems' && <ProblemsPanel />}
        {activePanel === 'output' && <OutputPanel />}
      </div>
    </div>
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
