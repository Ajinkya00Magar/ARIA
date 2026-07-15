import { Suspense } from 'react';
import { IdeLayout } from '@/components/ide/ide-layout';

// /editor/app — redirect to the unified IDE layout  
export default function EditorPage() {
  return (
    <Suspense fallback={<div>Loading Editor...</div>}>
      <IdeLayout />
    </Suspense>
  );
}
