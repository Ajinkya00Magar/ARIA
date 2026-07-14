'use client';

import { motion } from 'framer-motion';
import {
  Files, Search, GitBranch, Settings, Terminal, Cpu,
  CheckSquare, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import * as Tooltip from '@radix-ui/react-tooltip';

const PANELS = [
  { id: 'explorer', icon: Files, label: 'Explorer' },
  { id: 'search', icon: Search, label: 'Search' },
  { id: 'git', icon: GitBranch, label: 'Source Control' },
  { id: 'terminal', icon: Terminal, label: 'Terminal' },
  { id: 'tasks', icon: CheckSquare, label: 'Tasks' },
  { id: 'memory', icon: Cpu, label: 'AI Context' },
];

interface ActivityBarProps {
  activePanel: string;
  onChange: (panel: string) => void;
}

export function ActivityBar({ activePanel, onChange }: ActivityBarProps) {
  return (
    <Tooltip.Provider delayDuration={500}>
      <div className="w-11 flex flex-col items-center border-r border-[#262626] bg-[#141414] py-2 gap-0.5 shrink-0">
        {/* ARIA mini logo at top */}
        <div className="w-7 h-7 rounded-lg bg-[#0f62fe] flex items-center justify-center mb-2 shadow-sm shadow-[#0f62fe]/40">
          <Zap className="h-3.5 w-3.5 text-white" strokeWidth={2.5} />
        </div>

        {PANELS.map(({ id, icon: Icon, label }) => (
          <Tooltip.Root key={id}>
            <Tooltip.Trigger asChild>
              <button
                type="button"
                onClick={() => onChange(id)}
                aria-label={label}
                className={cn(
                  'relative w-8 h-8 flex items-center justify-center rounded-lg transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-[#0f62fe]',
                  activePanel === id
                    ? 'text-[#4589ff] bg-[#0f62fe]/12'
                    : 'text-[#525252] hover:text-[#a8a8a8] hover:bg-[#1e1e1e]',
                )}
              >
                {activePanel === id && (
                  <motion.div
                    layoutId="activity-indicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 bg-[#4589ff] rounded-r-full"
                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                  />
                )}
                <Icon className="h-4 w-4" />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                side="right"
                sideOffset={8}
                className="bg-[#262626] text-[#f4f4f4] text-[11px] px-2.5 py-1 rounded-lg shadow-lg border border-[#393939] z-50"
              >
                {label}
                <Tooltip.Arrow className="fill-[#393939]" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        ))}

        {/* Settings pinned at bottom */}
        <div className="mt-auto">
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                type="button"
                onClick={() => onChange('settings')}
                aria-label="Settings"
                className={cn(
                  'w-8 h-8 flex items-center justify-center rounded-lg transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-[#0f62fe]',
                  activePanel === 'settings'
                    ? 'text-[#4589ff] bg-[#0f62fe]/12'
                    : 'text-[#525252] hover:text-[#a8a8a8] hover:bg-[#1e1e1e]',
                )}
              >
                <Settings className="h-4 w-4" />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                side="right"
                sideOffset={8}
                className="bg-[#262626] text-[#f4f4f4] text-[11px] px-2.5 py-1 rounded-lg shadow-lg border border-[#393939] z-50"
              >
                Settings
                <Tooltip.Arrow className="fill-[#393939]" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </div>
      </div>
    </Tooltip.Provider>
  );
}
