'use client';

import { useState, useRef, useEffect } from 'react';
import {
  Code2, ChevronDown, Play, Square, GitBranch, Bell,
  Settings, User, LogOut, FolderOpen, Terminal, LayoutPanelLeft,
  MessageSquareText, Wifi, WifiOff, Loader2,
} from 'lucide-react';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { useAuthStore } from '@/stores/auth-store';
import { useAgentStore } from '@/stores/agent-store';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';

interface TopNavProps {
  showChat: boolean;
  showSidebar: boolean;
  onToggleChat: () => void;
  onToggleSidebar: () => void;
}

type MenuId = 'file' | 'edit' | 'view' | 'run' | 'terminal' | 'help' | null;

export function TopNav({ showChat, showSidebar, onToggleChat, onToggleSidebar }: TopNavProps) {
  const { currentWorkspace } = useWorkspaceStore();
  const { user, logout } = useAuthStore();
  const { agentStatus } = useAgentStore();
  const router = useRouter();
  const [openMenu, setOpenMenu] = useState<MenuId>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  // Close menus on outside click
  useEffect(() => {
    setMounted(true);
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
      if (userRef.current && !userRef.current.contains(e.target as Node)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const agentConnected = agentStatus !== 'error';

  const MENUS: { id: MenuId; label: string; items: MenuItemDef[] }[] = [
    {
      id: 'file',
      label: 'File',
      items: [
        { label: 'Open Workspace', icon: FolderOpen, action: () => router.push('/workspace') },
        { separator: true },
        { label: 'New Workspace', action: () => router.push('/workspace') },
      ],
    },
    {
      id: 'view',
      label: 'View',
      items: [
        { label: showSidebar ? 'Hide Explorer' : 'Show Explorer', icon: LayoutPanelLeft, action: onToggleSidebar, kbd: 'Ctrl+B' },
        { label: showChat ? 'Hide AI Chat' : 'Show AI Chat', icon: MessageSquareText, action: onToggleChat, kbd: 'Ctrl+J' },
        { separator: true },
        { label: 'Toggle Terminal', icon: Terminal, action: () => {} },
      ],
    },
    {
      id: 'run',
      label: 'Run',
      items: [
        { label: 'Run…', icon: Play, action: () => {} },
        { label: 'Stop', icon: Square, action: () => {} },
      ],
    },
    {
      id: 'terminal',
      label: 'Terminal',
      items: [
        { label: 'New Terminal', icon: Terminal, action: () => {} },
      ],
    },
    {
      id: 'help',
      label: 'Help',
      items: [
        { label: 'About IBM Coding Agent', action: () => {} },
        { label: 'IBM Orchestrate Docs', action: () => window.open('https://www.ibm.com/products/watson-orchestrate', '_blank') },
      ],
    },
  ];

  return (
    <header className="h-10 flex items-center justify-between border-b border-[#393939] bg-[#1e1e1e] shrink-0 select-none">
      {/* ── Left: Logo + Menu Bar ─────────────────────────────────────────── */}
      <div className="flex items-center h-full" ref={menuRef}>
        {/* IBM Logo */}
        <div className="flex items-center gap-2 px-3 h-full border-r border-[#393939]">
          <div className="w-5 h-5 rounded bg-[#0f62fe] flex items-center justify-center">
            <Code2 className="h-3 w-3 text-white" />
          </div>
          <span className="text-xs font-semibold text-white hidden sm:block">IBM</span>
        </div>

        {/* Menu Bar */}
        {MENUS.map((menu) => (
          <div key={menu.id} className="relative h-full">
            <button
              onClick={() => setOpenMenu(openMenu === menu.id ? null : menu.id)}
              className={cn(
                'h-full px-3 text-xs transition-colors',
                openMenu === menu.id
                  ? 'bg-[#393939] text-white'
                  : 'text-[#c6c6c6] hover:bg-[#262626] hover:text-white',
              )}
            >
              {menu.label}
            </button>

            <AnimatePresence>
              {openMenu === menu.id && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.1 }}
                  className="absolute left-0 top-full mt-px z-50 min-w-[200px] bg-[#262626] border border-[#393939] shadow-2xl rounded-sm py-1"
                >
                  {menu.items.map((item, i) =>
                    'separator' in item ? (
                      <div key={i} className="h-px bg-[#393939] my-1" />
                    ) : (
                      <button
                        key={i}
                        onClick={() => { item.action?.(); setOpenMenu(null); }}
                        className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-[#c6c6c6] hover:bg-[#393939] hover:text-white transition-colors text-left"
                      >
                        <span className="flex items-center gap-2">
                          {item.icon && <item.icon className="h-3.5 w-3.5 text-[#8d8d8d]" />}
                          {item.label}
                        </span>
                        {item.kbd && (
                          <kbd className="text-[10px] text-[#8d8d8d] font-mono">{item.kbd}</kbd>
                        )}
                      </button>
                    ),
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}

        {/* Workspace breadcrumb */}
        {currentWorkspace && (
          <div className="flex items-center gap-1 px-3 text-xs text-[#8d8d8d]">
            <span className="text-[#525252]">/</span>
            <span className="text-[#c6c6c6] max-w-[140px] truncate">{currentWorkspace.name}</span>
          </div>
        )}
      </div>

      {/* ── Center: Panel Toggles ─────────────────────────────────────────── */}
      <div className="hidden md:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
        <button
          onClick={onToggleSidebar}
          className={cn(
            'flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors',
            showSidebar
              ? 'bg-[#0f62fe]/20 text-[#4589ff] border border-[#0f62fe]/30'
              : 'text-[#8d8d8d] hover:bg-[#393939] hover:text-white',
          )}
        >
          <LayoutPanelLeft className="h-3 w-3" />
          <span className="hidden lg:block">Explorer</span>
        </button>

        <button
          onClick={onToggleChat}
          className={cn(
            'flex items-center gap-1 px-2.5 py-1 rounded text-xs transition-colors',
            showChat
              ? 'bg-[#0f62fe]/20 text-[#4589ff] border border-[#0f62fe]/30'
              : 'text-[#8d8d8d] hover:bg-[#393939] hover:text-white',
          )}
        >
          <MessageSquareText className="h-3 w-3" />
          <span className="hidden lg:block">AI Agent</span>
        </button>
      </div>

      {/* ── Right: Status + User ──────────────────────────────────────────── */}
      <div className="flex items-center h-full">
        {/* Agent status */}
        <div className="flex items-center gap-1.5 px-3 text-xs border-l border-[#393939]">
          {agentStatus === 'thinking' || agentStatus === 'executing' ? (
            <Loader2 className="h-3 w-3 animate-spin text-[#4589ff]" />
          ) : agentConnected ? (
            <Wifi className="h-3 w-3 text-[#42be65]" />
          ) : (
            <WifiOff className="h-3 w-3 text-[#da1e28]" />
          )}
          <span className="text-[#8d8d8d] hidden sm:block text-[10px]">
            {agentStatus === 'thinking' ? 'Agent thinking…' :
             agentStatus === 'executing' ? 'Executing…' :
             'IBM Orchestrate'}
          </span>
        </div>

        {/* Workspaces button */}
        <button
          onClick={() => router.push('/workspace')}
          className="h-full px-3 text-xs text-[#8d8d8d] hover:bg-[#262626] hover:text-white transition-colors border-l border-[#393939] hidden sm:flex items-center gap-1"
        >
          <FolderOpen className="h-3 w-3" />
          <span>Workspaces</span>
        </button>

        {/* User menu */}
        <div className="relative h-full border-l border-[#393939]" ref={userRef}>
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="h-full px-3 flex items-center gap-1.5 text-[#8d8d8d] hover:bg-[#262626] hover:text-white transition-colors"
          >
            <div className="w-5 h-5 rounded-full bg-[#0f62fe]/30 border border-[#0f62fe]/50 flex items-center justify-center">
              <User className="h-3 w-3 text-[#4589ff]" />
            </div>
            <span className="text-xs hidden sm:block max-w-[80px] truncate">
              {mounted ? (user?.name ?? 'Account') : 'Account'}
            </span>
            <ChevronDown className="h-3 w-3 hidden sm:block" />
          </button>

          <AnimatePresence>
            {showUserMenu && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.1 }}
                className="absolute right-0 top-full mt-px z-50 w-48 bg-[#262626] border border-[#393939] shadow-2xl rounded-sm py-1"
              >
                {user && (
                  <div className="px-3 py-2 border-b border-[#393939] mb-1">
                    <p className="text-xs font-medium text-white truncate">{user.name}</p>
                    <p className="text-[10px] text-[#8d8d8d] truncate">{user.email}</p>
                  </div>
                )}
                <button
                  onClick={() => { setShowUserMenu(false); router.push('/workspace'); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#c6c6c6] hover:bg-[#393939] hover:text-white transition-colors text-left"
                >
                  <Settings className="h-3.5 w-3.5 text-[#8d8d8d]" />
                  Settings
                </button>
                <button
                  onClick={() => { logout(); router.push('/workspace'); setShowUserMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-[#c6c6c6] hover:bg-[#da1e28]/20 hover:text-red-400 transition-colors text-left"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Sign Out
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </header>
  );
}

// ── Type helpers ──────────────────────────────────────────────────────────────

interface MenuSeparator {
  separator: true;
}

interface MenuAction {
  label: string;
  icon?: React.FC<{ className?: string }>;
  action?: () => void;
  kbd?: string;
}

type MenuItemDef = MenuSeparator | MenuAction;
