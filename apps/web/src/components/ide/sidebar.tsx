'use client';

import { ExplorerPanel } from './panels/explorer-panel';
import { SearchPanel } from './panels/search-panel';
import { GitPanel } from './panels/git-panel';
import { TasksPanel } from './panels/tasks-panel';
import { MemoryPanel } from './panels/memory-panel';
import { SettingsPanel } from './panels/settings-panel';

interface SidebarProps {
  activePanel: string;
}

export function Sidebar({ activePanel }: SidebarProps) {
  const panels: Record<string, React.ReactNode> = {
    explorer: <ExplorerPanel />,
    search: <SearchPanel />,
    git: <GitPanel />,
    tasks: <TasksPanel />,
    memory: <MemoryPanel />,
    settings: <SettingsPanel />,
  };

  return (
    <div className="h-full overflow-hidden bg-[#1e1e1e] border-r border-[#393939] flex flex-col">
      {panels[activePanel] ?? (
        <div className="p-4 text-sm text-[#8d8d8d]">Select a panel</div>
      )}
    </div>
  );
}
