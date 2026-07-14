'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
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
import { toast } from 'sonner';
import type { Workspace } from '@ibm-agent/types';

export function IdeLayout() {
  const [activeSidebarPanel, setActiveSidebarPanel] = useState<string>('explorer');
  const [showChat, setShowChat] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showBottom, setShowBottom] = useState(false);
  const [activeBottomPanel, setActiveBottomPanel] = useState<'terminal' | 'output' | 'problems'>('terminal');
  const { permissionRequest } = useAgentStore();
  const { currentWorkspace, openFiles, activeFileIndex, setWorkspace } = useWorkspaceStore();
  const params = useParams<{ id?: string }>();

  // ── Open terminal panel ──────────────────────────────────────────────────
  const handleOpenTerminal = () => {
    setShowBottom(true);
    setActiveBottomPanel('terminal');
  };

  // ── Run active file ──────────────────────────────────────────────────────
  const handleRunFile = async () => {
    const activeFile = openFiles[activeFileIndex];
    if (!activeFile || !currentWorkspace) {
      toast.error('No file open to run');
      return;
    }

    // Determine run command by extension
    const ext = activeFile.name.split('.').pop()?.toLowerCase() ?? '';
    const commandMap: Record<string, string> = {
      py: `python "${activeFile.path}"`,
      js: `node "${activeFile.path}"`,
      ts: `tsx "${activeFile.path}"`,
      sh: `bash "${activeFile.path}"`,
      rb: `ruby "${activeFile.path}"`,
      go: `go run "${activeFile.path}"`,
      rs: `cargo run`,
      java: `javac "${activeFile.path}" && java "${activeFile.name.replace('.java', '')}"`,
    };
    const command = commandMap[ext];
    if (!command) {
      toast.error(`No run command available for .${ext} files`);
      return;
    }

    // Open the terminal panel so output is visible
    setShowBottom(true);
    setActiveBottomPanel('terminal');

    // Execute the command via the terminal API
    try {
      const res = await apiClient.post<{ data: { stdout: string; stderr: string; exitCode: number } }>(
        `/terminal/${currentWorkspace.id}/exec`,
        { command },
      );
      const { stdout, stderr, exitCode } = res.data.data;
      if (stdout) toast.success(stdout.slice(0, 120));
      if (stderr) toast.error(stderr.slice(0, 120));
      if (exitCode !== 0) toast.warning(`Process exited with code ${exitCode}`);
    } catch {
      toast.error('Failed to run file — is the API server running?');
    }
  };

  // Load workspace if ID in URL
  useEffect(() => {
    if (params?.id) {
      apiClient
        .get<{ data: Workspace }>(`/workspaces/${params.id}`)
        .then((res) => setWorkspace(res.data.data))
        .catch(() => {
          // workspace not found or no permission
        });
    }
  }, [params?.id, setWorkspace]);

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
        onOpenTerminal={handleOpenTerminal}
        onRunFile={() => { void handleRunFile(); }}
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
