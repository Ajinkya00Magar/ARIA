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

export function IdeLayout() {
  const router = useRouter();
  const [activeSidebarPanel, setActiveSidebarPanel] = useState<string>('explorer');
  const [showChat, setShowChat] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showBottom, setShowBottom] = useState(false);
  const [activeBottomPanel, setActiveBottomPanel] = useState<'terminal' | 'output' | 'problems'>('terminal');
  const { permissionRequest } = useAgentStore();
  const { setWorkspace } = useWorkspaceStore();
  const searchParams = useSearchParams();
  const id = searchParams.get('id');

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
        if (e.key === '`') { e.preventDefault(); setShowBottom(true); setActiveBottomPanel('terminal'); }
      }
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, []);

  // When activity bar 'terminal' is clicked, open bottom panel
  const handleSidebarChange = (panel: string) => {
    if (panel === 'terminal') {
      setShowBottom((v) => !v);
      setActiveBottomPanel('terminal');
      return;
    }
    setActiveSidebarPanel(panel);
    setShowSidebar(true);
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#161616] text-[#f4f4f4]">
      <TopNav
        showChat={showChat}
        showSidebar={showSidebar}
        onToggleChat={() => setShowChat((v) => !v)}
        onToggleSidebar={() => setShowSidebar((v) => !v)}
      />

      <div className="flex flex-1 overflow-hidden">
        <ActivityBar
          activePanel={activeSidebarPanel}
          onChange={handleSidebarChange}
        />

        {/* Main horizontal split */}
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

      <StatusBar />
      {permissionRequest && <PermissionDialog />}
    </div>
  );
}
