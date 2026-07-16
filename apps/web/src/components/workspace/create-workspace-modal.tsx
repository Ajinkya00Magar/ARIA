// ─────────────────────────────────────────────────────────────────────────────
// CreateWorkspaceModal — create or clone a workspace
// ─────────────────────────────────────────────────────────────────────────────

'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FolderPlus, GitBranch, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import type { Workspace } from '@ibm-agent/types';

const Schema = z.object({
  name: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  gitUrl: z.string().url('Invalid URL').optional().or(z.literal('')),
  gitBranch: z.string().optional(),
  path: z.string().min(1, 'Pick or enter a folder'),
});
type FormData = z.infer<typeof Schema>;

interface Props {
  onClose: () => void;
  onCreate: (ws: Workspace) => void;
}

export function CreateWorkspaceModal({ onClose, onCreate }: Props) {
  const [isLoading, setIsLoading] = useState(false);
  const [isPicking, setIsPicking] = useState(false);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(Schema),
  });

  const hasGitUrl = !!watch('gitUrl');

  // Native OS folder picker (served by the Electron main process)
  const pickFolder = async () => {
    setIsPicking(true);
    try {
      const res = await apiClient.post<{ data: { canceled: boolean; path: string | null; unsupported?: boolean } }>(
        '/system/pick-folder',
      );
      const { canceled, path, unsupported } = res.data.data;
      if (unsupported) {
        toast.info('Native folder picker unavailable — type the folder path manually.');
        return;
      }
      if (!canceled && path) {
        setValue('path', path, { shouldValidate: true });
        const base = path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? path;
        if (!watch('name')) setValue('name', base);
      }
    } catch (err: any) {
      console.error(err);
      toast.error(`Could not open the folder picker: ${err.message || String(err)}`);
    } finally {
      setIsPicking(false);
    }
  };

  const onSubmit = async (data: FormData) => {
    setIsLoading(true);
    try {
      const res = await apiClient.post<{ data: Workspace }>('/workspaces', {
        name: data.name || undefined,
        description: data.description || undefined,
        gitUrl: data.gitUrl || undefined,
        gitBranch: data.gitBranch || undefined,
        path: data.path,
      });
      onCreate(res.data.data);
      toast.success(`Folder opened!`);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: { message?: string } } } })?.response?.data?.error?.message ?? 'Failed to open folder';
      toast.error(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full p-6"
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FolderPlus className="h-5 w-5 text-primary" />
              <h2 className="text-base font-semibold">Open Folder</h2>
            </div>
            <button onClick={onClose} className="p-1 rounded hover:bg-muted transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 flex items-center gap-2">
                <FolderPlus className="h-3.5 w-3.5" />
                Folder *
              </label>
              <div className="flex gap-2">
                <input
                  {...register('path')}
                  placeholder="C:\Users\username\Desktop\MyProject"
                  className="flex-1 px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  type="button"
                  onClick={pickFolder}
                  disabled={isPicking}
                  className="px-3 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors disabled:opacity-50 whitespace-nowrap"
                >
                  {isPicking ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Browse…'}
                </button>
              </div>
              <p className="text-muted-foreground text-xs mt-1">Pick any folder on your computer to work in it directly.</p>
              {errors.path && <p className="text-destructive text-xs mt-1">{errors.path.message}</p>}
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Name</label>
              <input
                {...register('name')}
                placeholder="Defaults to the folder name"
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {errors.name && <p className="text-destructive text-xs mt-1">{errors.name.message}</p>}
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Description</label>
              <textarea
                {...register('description')}
                rows={2}
                placeholder="What is this project about?"
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 flex items-center gap-2">
                <GitBranch className="h-3.5 w-3.5" />
                Clone from Git (optional)
              </label>
              <input
                {...register('gitUrl')}
                placeholder="https://github.com/org/repo"
                className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {errors.gitUrl && <p className="text-destructive text-xs mt-1">{errors.gitUrl.message}</p>}
            </div>

            {hasGitUrl && (
              <div>
                <label className="text-sm font-medium mb-1.5 block">Branch</label>
                <input
                  {...register('gitBranch')}
                  placeholder="main"
                  className="w-full px-3 py-2 bg-background border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-2 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {hasGitUrl ? 'Cloning…' : 'Opening…'}
                  </>
                ) : (
                  hasGitUrl ? 'Clone into Folder' : 'Open Folder'
                )}
              </button>
            </div>
          </form>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
