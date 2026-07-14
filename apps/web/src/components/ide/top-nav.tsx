'use client';

import { useState, useRef, useEffect } from 'react';
import {
  ChevronDown, GitBranch, Settings, User, LogOut, FolderOpen, Terminal,
  LayoutPanelLeft, MessageSquareText, Loader2, Zap, CheckCircle,
  AlertCircle, Play, Square,
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
  onOpenTerminal: () => void;
  onRunFile: () => void;
}

type MenuId = 'file' | 'edit' | 'view' | 'run' | 'terminal' | 'help' | null;

export function TopNav({ showChat, showSidebar, onToggleChat, onToggleSidebar, onOpenTerminal, onRunFile }: TopNavProps) {
  const { currentWorkspace } = useWorkspaceStore();
  const { user, logout } = useAuthStore();
  const { agentStatus } = useAgentStore();
  const router = useRouter();
  const [openMenu, setOpenMenu] = useState<MenuId>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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

  const isAgentActive = agentStatus === 'thinking' || agentStatus === 'executing';

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
        {
          label: showSidebar ? 'Hide Explorer' : 'Show Explorer',
          icon: LayoutPanelLeft,
          action: onToggleSidebar,
          kbd: 'Ctrl+B',
        },
        {
          label: showChat ? 'Hide ARIA' : 'Show ARIA',
          icon: MessageSquareText,
          action: onToggleChat,
          kbd: 'Ctrl+J',
        },
        { separator: true },
        { label: 'Toggle Terminal', icon: Terminal, action: onOpenTerminal },
      ],
    },
    {
      id: 'run',
      label: 'Run',
      items: [
        { label: 'Run…', icon: Play, action: onRunFile },
        { label: 'Stop', icon: Square, action: () => {} },
      ],
    },
    {
      id: 'terminal',
      label: 'Terminal',
      items: [
        { label: 'New Terminal', icon: Terminal, action: onOpenTerminal },
      ],
    },
    {
      id: 'help',
      label: 'Help',
      items: [
        { label: 'About ARIA', action: () => {} },
        { label: 'IBM Orchestrate Docs', action: () => window.open('https://www.ibm.com/products/watson-orchestrate', '_blank') },
        { label: 'IBM watsonx Docs', action: () => window.open('https://www.ibm.com/products/watsonx-ai', '_blank') },
      ],
    },
  ];

  return (
    <header className="h-10 flex items-center justify-between border-b border-[#393939] bg-[#141414] shrink-0 select-none z-40">
      {/* ── Left: ARIA Logo + Menu ─────────────────────────────────────────── */}
      <div className="flex items-center h-full" ref={menuRef}>
        {/* ARIA Logo */}
        <div className="flex items-center gap-2.5 px-3 h-full border-r border-[#393939] shrink-0">
          <div className="w-5 h-5 rounded bg-[#0f62fe] flex items-center justify-center shadow-sm shadow-[#0f62fe]/40">
            <Zap className="h-3 w-3 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-[13px] font-semibold tracking-wide text-white">ARIA</span>
        </div>

        {/* Menu Bar */}
        {MENUS.map((menu) => (
          <div key={menu.id} className="relative h-full">
            <button
              onClick={() => setOpenMenu(openMenu === menu.id ? null : menu.id)}
              className={cn(
                'h-full px-3 text-[12px] transition-colors',
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
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.08 }}
                  className="absolute left-0 top-full mt-px z-50 min-w-[200px] bg-[#262626] border border-[#525252] shadow-2xl rounded-sm py-1"
                >
                  {menu.items.map((item, i) =>
                    'separator' in item ? (
                      <div key={i} className="h-px bg-[#393939] my-1" />
                    ) : (
                      <button
                        key={i}
                        onClick={() => {
                          item.action?.();
                          setOpenMenu(null);
                        }}
                        className="w-full flex items-center justify-between px-3 py-1.5 text-[12px] text-[#c6c6c6] hover:bg-[#393939] hover:text-white transition-colors text-left"
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
          <div className="flex items-center gap-1.5 px-3 text-[11px] text-[#8d8d8d] border-l border-[#393939] ml-1">
            <FolderOpen className="h-3 w-3 text-[#525252]" />
            <span className="text-[#a8a8a8] max-w-[200px] truncate">{currentWorkspace.name}</span>
          </div>
        )}
      </div>

      {/* ── Center: Panel Toggles ─────────────────────────────────────────── */}
      <div className="hidden md:flex items-center gap-1 absolute left-1/2 -translate-x-1/2">
        <button
          onClick={onToggleSidebar}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] transition-all',
            showSidebar
              ? 'bg-[#0f62fe]/15 text-[#4589ff] border border-[#0f62fe]/25'
              : 'text-[#8d8d8d] hover:bg-[#2e2e2e] hover:text-white border border-transparent',
          )}
        >
          <LayoutPanelLeft className="h-3 w-3" />
          <span className="hidden lg:block">Explorer</span>
        </button>

        <button
          onClick={onToggleChat}
          className={cn(
            'flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] transition-all',
            showChat
              ? 'bg-[#0f62fe]/15 text-[#4589ff] border border-[#0f62fe]/25'
              : 'text-[#8d8d8d] hover:bg-[#2e2e2e] hover:text-white border border-transparent',
          )}
        >
          <Zap className="h-3 w-3" />
          <span className="hidden lg:block">ARIA</span>
        </button>
      </div>

      {/* ── Right: Agent Status + User ────────────────────────────────────── */}
      <div className="flex items-center h-full">
        {/* Agent / Orchestrate status */}
        <div className="flex items-center gap-1.5 px-3 text-[11px] border-l border-[#393939]">
          {isAgentActive ? (
            <Loader2 className="h-3 w-3 animate-spin text-[#4589ff]" />
          ) : agentStatus === 'error' ? (
            <AlertCircle className="h-3 w-3 text-[#da1e28]" />
          ) : (
            <CheckCircle className="h-3 w-3 text-[#24a148]" />
          )}
          <span className="text-[#8d8d8d] hidden sm:block">
            {isAgentActive
              ? agentStatus === 'thinking'
                ? 'Thinking…'
                : 'Executing…'
              : agentStatus === 'error'
              ? 'Error'
              : 'Orchestrate'}
          </span>
        </div>

        {/* Workspaces */}
        <button
          onClick={() => router.push('/workspace')}
          className="h-full px-3 text-[11px] text-[#8d8d8d] hover:bg-[#262626] hover:text-white transition-colors border-l border-[#393939] hidden sm:flex items-center gap-1.5"
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
            <div className="w-5 h-5 rounded-full bg-[#0f62fe]/25 border border-[#0f62fe]/40 flex items-center justify-center">
              <span className="text-[9px] font-bold text-[#4589ff]">
                {user?.name?.charAt(0).toUpperCase() ?? 'U'}
              </span>
            </div>
            <span className="text-[11px] hidden sm:block max-w-[80px] truncate">
              {user?.name ?? 'Account'}
            </span>
            <ChevronDown className="h-3 w-3 hidden sm:block" />
          </button>

          <AnimatePresence>
            {showUserMenu && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.08 }}
                className="absolute right-0 top-full mt-px z-50 w-52 bg-[#262626] border border-[#525252] shadow-2xl rounded-sm py-1"
              >
                {user && (
                  <div className="px-3 py-2 border-b border-[#393939] mb-1">
                    <p className="text-[12px] font-medium text-white truncate">{user.name}</p>
                    <p className="text-[10px] text-[#8d8d8d] truncate">{user.email}</p>
                  </div>
                )}
                <button
                  onClick={() => { setShowUserMenu(false); router.push('/workspace'); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-[#c6c6c6] hover:bg-[#393939] hover:text-white transition-colors text-left"
                >
                  <Settings className="h-3.5 w-3.5 text-[#8d8d8d]" />
                  Settings
                </button>
                <button
                  onClick={() => { logout(); router.push('/workspace'); setShowUserMenu(false); }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-[#c6c6c6] hover:bg-red-900/20 hover:text-red-400 transition-colors text-left"
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

// ── Type helpers ───────────────────────────────────────────────────────────────

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
