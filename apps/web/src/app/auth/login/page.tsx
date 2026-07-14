'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { Eye, EyeOff, Mail, Lock, Zap, Github } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';

const LoginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});
type LoginForm = z.infer<typeof LoginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { setAuth } = useAuthStore();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(LoginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    try {
      const res = await apiClient.post<{
        data: { user: unknown; accessToken: string; expiresIn: number };
      }>('/auth/login', data);
      setAuth(res.data.data.user as never, res.data.data.accessToken);
      router.push('/workspace');
      toast.success('Welcome back!');
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error
          ?.message ?? 'Login failed';
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#101010] p-4">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-sm"
      >
        {/* ARIA Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-[#0f62fe] mb-4 shadow-lg shadow-[#0f62fe]/30">
            <Zap className="h-6 w-6 text-white" strokeWidth={2.5} />
          </div>
          <h1 className="text-[22px] font-bold text-white tracking-tight">ARIA</h1>
          <p className="text-[12px] text-[#525252] mt-1">Sign in to your workspace</p>
        </div>

        {/* Form card */}
        <div className="bg-[#141414] border border-[#262626] rounded-2xl p-6 shadow-xl">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="text-[12px] font-medium text-[#a8a8a8] mb-1.5 block">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#525252]" />
                <input
                  {...register('email')}
                  type="email"
                  placeholder="you@example.com"
                  className="w-full pl-9 pr-3 py-2 bg-[#1a1a1a] border border-[#262626] rounded-lg text-[13px] text-white focus:outline-none focus:border-[#0f62fe]/60 transition-colors placeholder:text-[#3d3d3d]"
                />
              </div>
              {errors.email && (
                <p className="text-[#da1e28] text-[11px] mt-1">{errors.email.message}</p>
              )}
            </div>

            <div>
              <label className="text-[12px] font-medium text-[#a8a8a8] mb-1.5 block">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#525252]" />
                <input
                  {...register('password')}
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-9 py-2 bg-[#1a1a1a] border border-[#262626] rounded-lg text-[13px] text-white focus:outline-none focus:border-[#0f62fe]/60 transition-colors placeholder:text-[#3d3d3d]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#525252] hover:text-[#a8a8a8] transition-colors"
                >
                  {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
              {errors.password && (
                <p className="text-[#da1e28] text-[11px] mt-1">{errors.password.message}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-2.5 px-4 bg-[#0f62fe] text-white rounded-xl text-[13px] font-medium hover:bg-[#0353e9] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-[#0f62fe]/20 mt-2"
            >
              {isLoading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <div className="relative my-4">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[#262626]" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-[#141414] px-2 text-[11px] text-[#3d3d3d]">or</span>
            </div>
          </div>

          <a
            href={`${process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001'}/api/auth/github`}
            className="flex items-center justify-center gap-2 py-2 px-4 border border-[#262626] rounded-xl text-[12px] text-[#a8a8a8] hover:bg-[#1e1e1e] hover:text-white hover:border-[#393939] transition-colors"
          >
            <Github className="h-3.5 w-3.5" />
            Continue with GitHub
          </a>
        </div>

        <p className="text-center text-[12px] text-[#525252] mt-4">
          No account?{' '}
          <Link href="/auth/register" className="text-[#4589ff] hover:underline">
            Sign up
          </Link>
        </p>
      </motion.div>
    </div>
  );
}
