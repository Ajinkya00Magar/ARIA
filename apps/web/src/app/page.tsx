'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // Land on the folder hub first — the user picks a folder to work in
    router.replace('/workspace');
  }, [router]);

  return (
    <div className="flex h-full items-center justify-center">
      <div className="animate-pulse text-muted-foreground text-sm">Loading ARIA IDE…</div>
    </div>
  );
}
