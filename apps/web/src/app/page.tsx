'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  return (
    <div className="flex h-full items-center justify-center">
      <div className="animate-pulse text-muted-foreground text-sm">Loading IBM Coding Agent…</div>
    </div>
  );
}
