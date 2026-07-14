'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { IdeLayout } from '@/components/ide/ide-layout';

export default function DashboardPage() {
  const { currentWorkspace } = useWorkspaceStore();
  const router = useRouter();

  useEffect(() => {
    // If no workspace is open, redirect to workspace selector
    if (!currentWorkspace) {
      router.replace('/workspace');
    }
  }, [currentWorkspace, router]);

  if (!currentWorkspace) {
    return null; // redirect in progress
  }

  return <IdeLayout />;
}
