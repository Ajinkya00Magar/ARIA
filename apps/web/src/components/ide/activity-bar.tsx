'use client';

import { motion } from 'framer-motion';
import {
  Files, Search, GitBranch, Settings, Terminal, Cpu,
  BookOpen, Bot, CheckSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import * as Tooltip from '@radix-ui/react-tooltip';

const PANELS = [
  { id: 'explorer', icon: Files, label: 'Explorer' },
  { id: 'search', icon: Search, label: 'Search' },
  { id: 'git', icon: GitBranch, label: 'Source Control' },
  { id: 'tasks', icon: CheckSquare, label: 'Tasks' },
  { id: 'memory', icon: Cpu, label: 'AI Memory' },
  { id: 'docs', icon: BookOpen, label: 'Documentation' },
];

interface ActivityBarProps {
  activePanel: string;
  onChange: (panel: string) => void;
}

export function ActivityBar({ activePanel, onChange }: ActivityBarProps) {
  return (
    <Tooltip.Provider delayDuration={400}>
      <div className="w-12 flex flex-col items-center border-r border-[#393939] bg-[#1e1e1e] py-2 gap-1 shrink-0">
        {PANELS.map(({ id, icon: Icon, label }) => (
          <Tooltip.Root key={id}>
            <Tooltip.Trigger asChild>
              <button
                type="button"
                onClick={() => onChange(id)}
                className={cn(
                  'relative w-9 h-9 flex items-center justify-center rounded transition-all focus:outline-none',
                  activePanel === id
                    ? 'text-[#4589ff] bg-[#0f62fe]/15'
                    : 'text-[#8d8d8d] hover:text-[#c6c6c6] hover:bg-[#262626]',
                )}
              >
                {activePanel === id && (
                  <motion.div
                    layoutId="activity-indicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-[#4589ff] rounded-r-full"
                  />
                )}
                <Icon className="h-4 w-4" />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                side="right"
                sideOffset={6}
                className="bg-[#393939] text-[#f4f4f4] text-xs px-2.5 py-1 rounded shadow-lg border border-[#525252] z-50"
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
                className={cn(
                  'w-9 h-9 flex items-center justify-center rounded transition-all focus:outline-none',
                  activePanel === 'settings'
                    ? 'text-[#4589ff] bg-[#0f62fe]/15'
                    : 'text-[#8d8d8d] hover:text-[#c6c6c6] hover:bg-[#262626]',
                )}
              >
                <Settings className="h-4 w-4" />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                side="right"
                sideOffset={6}
                className="bg-[#393939] text-[#f4f4f4] text-xs px-2.5 py-1 rounded shadow-lg border border-[#525252] z-50"
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
