'use client';

import { useWorkspaceStore } from '@/stores/workspace-store';
import { useAgentStore } from '@/stores/agent-store';
import { IdeLayout } from '@/components/ide/ide-layout';

export default function WorkspaceDashboard() {
  return <IdeLayout />;
}
