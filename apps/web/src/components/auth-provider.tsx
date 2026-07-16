'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/auth-store';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, setAuth } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);

  useEffect(() => {
    setMounted(true);
    
    // Check active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setAuth({
          id: session.user.id,
          email: session.user.email!,
          name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
          role: 'developer',
          provider: 'local',
          createdAt: new Date(),
          updatedAt: new Date()
        }, session.access_token);
      }
      setIsInitializing(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setAuth({
          id: session.user.id,
          email: session.user.email!,
          name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0],
          role: 'developer',
          provider: 'local',
          createdAt: new Date(),
          updatedAt: new Date()
        }, session.access_token);
      } else {
        useAuthStore.getState().logout();
      }
    });

    return () => subscription.unsubscribe();
  }, [setAuth]);

  useEffect(() => {
    if (!mounted || isInitializing) return;
    const isAuthenticated = !!user;
    
    // Handle redirecting for unauthenticated users
    if (!isAuthenticated && pathname && !pathname.startsWith('/auth') && pathname !== '/login') {
      router.replace('/login');
    } 
    // Handle redirecting for authenticated users away from auth pages
    else if (isAuthenticated && (pathname === '/auth/login' || pathname === '/auth/register' || pathname === '/login')) {
      router.replace('/workspace');
    }
  }, [user, pathname, router, mounted, isInitializing]);

  if (!mounted || isInitializing) {
    return <div className="flex h-screen items-center justify-center bg-[#161616] text-[#f4f4f4]">Loading ARIA IDE...</div>;
  }

  // To prevent flashing protected content
  if (!user && pathname && !pathname.startsWith('/auth') && pathname !== '/login') {
    return <div className="flex h-screen items-center justify-center bg-[#161616] text-[#f4f4f4]">Redirecting to login...</div>;
  }

  return <>{children}</>;
}
