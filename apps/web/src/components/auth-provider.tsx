'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    
    async function checkAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (mounted) {
          if (!session && pathname !== '/login') {
            router.replace('/login');
          } else {
            setLoading(false);
          }
        }
      } catch (e) {
        if (mounted) {
          setLoading(false);
          router.replace('/login');
        }
      }
    }

    checkAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && pathname !== '/login') {
        router.replace('/login');
      } else if (session && pathname === '/login') {
        router.replace('/workspace');
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [pathname, router]);

  if (loading && pathname !== '/login') {
    return <div className="flex h-screen items-center justify-center">Loading ARIA IDE...</div>;
  }

  return <>{children}</>;
}
