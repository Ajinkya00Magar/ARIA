import { Suspense } from 'react';
import { IdeLayout } from '@/components/ide/ide-layout';

export default function DashboardPage() {
  return (
    <Suspense fallback={<div>Loading Dashboard...</div>}>
      <IdeLayout />
    </Suspense>
  );
}
