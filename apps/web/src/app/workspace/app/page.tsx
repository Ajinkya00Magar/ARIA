import { Suspense } from 'react';
import { IdeLayout } from '@/components/ide/ide-layout';

export default function WorkspaceDashboard() {
  return (
    <Suspense fallback={<div>Loading IDE...</div>}>
      <IdeLayout />
    </Suspense>
  );
}
