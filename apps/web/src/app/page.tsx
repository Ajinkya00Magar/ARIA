'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Zap } from 'lucide-react';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/workspace');
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center bg-[#101010]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-[#0f62fe] flex items-center justify-center animate-pulse shadow-lg shadow-[#0f62fe]/30">
          <Zap className="h-6 w-6 text-white" strokeWidth={2.5} />
        </div>
        <div className="text-center">
          <p className="text-[14px] font-semibold text-white">ARIA</p>
          <p className="text-[11px] text-[#525252] mt-0.5">Loading…</p>
        </div>
      </div>
    </div>
  );
}
