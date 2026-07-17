'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels';
import { ActivityBar } from '@/components/ide/activity-bar';
import { Sidebar } from '@/components/ide/sidebar';
import { EditorArea } from '@/components/ide/editor-area';
import { ChatPanel } from '@/components/chat/chat-panel';
import { StatusBar } from '@/components/ide/status-bar';
import { TopNav } from '@/components/ide/top-nav';
import { PermissionDialog } from '@/components/agent/permission-dialog';
import { BottomPanel } from '@/components/ide/bottom-panel';
import { useAgentStore } from '@/stores/agent-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { apiClient } from '@/lib/api-client';
import type { Workspace } from '@ibm-agent/types';
import { cn } from '@/lib/utils';
import { Folder, Code2, MessageSquareText } from 'lucide-react';

export function IdeLayout() {
  const router = useRouter();
  const [activeSidebarPanel, setActiveSidebarPanel] = useState<string>('explorer');
  const [showChat, setShowChat] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showBottom, setShowBottom] = useState(false);
  const [activeBottomPanel, setActiveBottomPanel] = useState<'output' | 'problems'>('output');
  const { permissionRequest } = useAgentStore();
  const { setWorkspace } = useWorkspaceStore();
  const searchParams = useSearchParams();
  const id = searchParams?.get('id');

  const [isMobile, setIsMobile] = useState(false);
  const [mobileTab, setMobileTab] = useState<'explorer' | 'editor' | 'chat'>('editor');

  // Load workspace if ID in URL; otherwise send the user to the folder hub
  useEffect(() => {
    if (id) {
      apiClient
        .get<{ data: Workspace }>(`/workspaces/${id}`)
        .then((res) => setWorkspace(res.data.data))
        .catch(() => {
          // workspace not found (folder moved/removed) — pick again
          router.push('/workspace');
        });
    } else {
      router.push('/workspace');
    }
  }, [id, setWorkspace, router]);

  // Handle keyboard shortcuts
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'b') { e.preventDefault(); setShowSidebar((v) => !v); }
        if (e.key === 'j') { e.preventDefault(); setShowBottom((v) => !v); }
        if (e.key === '`') { e.preventDefault(); setShowBottom(true); setActiveBottomPanel('output'); }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // Screen resize detector
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // When activity bar is clicked
  const handleSidebarChange = (panel: string) => {
    setActiveSidebarPanel(panel);
    setShowSidebar(true);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#161616] text-[#f4f4f4]">
      <TopNav
        showChat={isMobile ? mobileTab === 'chat' : showChat}
        showSidebar={isMobile ? mobileTab === 'explorer' : showSidebar}
        onToggleChat={() => {
          if (isMobile) {
            setMobileTab(mobileTab === 'chat' ? 'editor' : 'chat');
          } else {
            setShowChat((v) => !v);
          }
        }}
        onToggleSidebar={() => {
          if (isMobile) {
            setMobileTab(mobileTab === 'explorer' ? 'editor' : 'explorer');
          } else {
            setShowSidebar((v) => !v);
          }
        }}
      />

      {isMobile ? (
        // Mobile Layout: Show active panel and a bottom navigation bar
        <>
          <div className="flex-1 flex overflow-hidden min-h-0">
            {mobileTab === 'explorer' && (
              <div className="flex-1 flex overflow-hidden">
                <ActivityBar
                  activePanel={activeSidebarPanel}
                  onChange={handleSidebarChange}
                />
                <div className="flex-1 overflow-hidden">
                  <Sidebar activePanel={activeSidebarPanel} />
                </div>
              </div>
            )}

            {mobileTab === 'editor' && (
              <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                <div className="flex-1 min-h-0">
                  <EditorArea />
                </div>
                {showBottom && (
                  <div className="h-[40%] border-t border-[#393939] shrink-0 min-h-0">
                    <BottomPanel
                      activePanel={activeBottomPanel}
                      onChangePanel={setActiveBottomPanel}
                      onClose={() => setShowBottom(false)}
                    />
                  </div>
                )}
              </div>
            )}

            {mobileTab === 'chat' && (
              <div className="flex-1 overflow-hidden">
                <ChatPanel />
              </div>
            )}
          </div>

          {/* Bottom Mobile Nav */}
          <div className="h-12 border-t border-[#393939] bg-[#1e1e1e] flex justify-around items-center shrink-0 select-none">
            <button
              onClick={() => setMobileTab('explorer')}
              className={cn(
                'flex flex-col items-center justify-center gap-1 flex-1 h-full text-[10px] font-medium transition-colors',
                mobileTab === 'explorer' ? 'text-[#4589ff]' : 'text-[#8d8d8d]'
              )}
            >
              <Folder className="h-4 w-4" />
              <span>Explorer</span>
            </button>

            <button
              onClick={() => setMobileTab('editor')}
              className={cn(
                'flex flex-col items-center justify-center gap-1 flex-1 h-full text-[10px] font-medium transition-colors',
                mobileTab === 'editor' ? 'text-[#4589ff]' : 'text-[#8d8d8d]'
              )}
            >
              <Code2 className="h-4 w-4" />
              <span>Editor</span>
            </button>

            <button
              onClick={() => setMobileTab('chat')}
              className={cn(
                'flex flex-col items-center justify-center gap-1 flex-1 h-full text-[10px] font-medium transition-colors',
                mobileTab === 'chat' ? 'text-[#4589ff]' : 'text-[#8d8d8d]'
              )}
            >
              <MessageSquareText className="h-4 w-4" />
              <span>AI Agent</span>
            </button>
          </div>
        </>
      ) : (
        // Desktop Layout
        <div className="flex flex-1 overflow-hidden">
          <ActivityBar
            activePanel={activeSidebarPanel}
            onChange={handleSidebarChange}
          />

          <PanelGroup direction="horizontal" className="flex-1 overflow-hidden">
            {/* Sidebar */}
            {showSidebar && (
              <>
                <Panel defaultSize={18} minSize={12} maxSize={35} id="sidebar">
                  <Sidebar activePanel={activeSidebarPanel} />
                </Panel>
                <PanelResizeHandle className="w-px bg-[#393939] hover:bg-[#0f62fe] transition-colors cursor-col-resize" />
              </>
            )}

            {/* Editor + Bottom Panel vertical split */}
            <Panel defaultSize={showChat ? 55 : 82} minSize={30} id="editor">
              <PanelGroup direction="vertical">
                <Panel defaultSize={showBottom ? 65 : 100} minSize={30} id="editor-main">
                  <EditorArea />
                </Panel>

                {showBottom && (
                  <>
                    <PanelResizeHandle className="h-px bg-[#393939] hover:bg-[#0f62fe] transition-colors cursor-row-resize" />
                    <Panel defaultSize={35} minSize={20} maxSize={60} id="bottom-panel">
                      <BottomPanel
                        activePanel={activeBottomPanel}
                        onChangePanel={setActiveBottomPanel}
                        onClose={() => setShowBottom(false)}
                      />
                    </Panel>
                  </>
                )}
              </PanelGroup>
            </Panel>

            {/* Chat Panel */}
            {showChat && (
              <>
                <PanelResizeHandle className="w-px bg-[#393939] hover:bg-[#0f62fe] transition-colors cursor-col-resize" />
                <Panel defaultSize={27} minSize={20} maxSize={50} id="chat">
                  <ChatPanel />
                </Panel>
              </>
            )}
          </PanelGroup>
        </div>
      )}

      {!isMobile && <StatusBar />}
      {permissionRequest && <PermissionDialog />}
    </div>
  );
}
