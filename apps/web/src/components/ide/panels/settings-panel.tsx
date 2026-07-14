'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { toast } from 'sonner';

interface Settings {
  theme: string;
  fontSize: number;
  tabSize: number;
  autoSave: boolean;
  modelId: string;
  temperature: number;
  maxTokens: number;
}

export function SettingsPanel() {
  const qc = useQueryClient();

  const { data: settings } = useQuery<Settings>({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await apiClient.get<{ data: Settings }>('/settings');
      return res.data.data;
    },
  });

  const [form, setForm] = useState<Partial<Settings>>({});

  const mutation = useMutation({
    mutationFn: async (data: Partial<Settings>) => {
      await apiClient.put('/settings', data);
    },
    onSuccess: () => {
      toast.success('Settings saved');
      void qc.invalidateQueries({ queryKey: ['settings'] });
    },
  });

  const current = { ...settings, ...form };

  const field = <T extends keyof Settings>(key: T, label: string, type: string) => (
    <div>
      <label className="text-xs font-medium text-muted-foreground block mb-1">{label}</label>
      <input
        type={type}
        value={String(current[key] ?? '')}
        onChange={(e) =>
          setForm((p) => ({
            ...p,
            [key]: type === 'number' ? Number(e.target.value) : e.target.value,
          }))
        }
        className="w-full px-2 py-1.5 bg-background border border-input rounded text-xs focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  );

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 border-b border-border">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Settings</p>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        <section>
          <p className="text-xs font-semibold text-foreground mb-2">Editor</p>
          <div className="space-y-2">
            {field('fontSize', 'Font Size', 'number')}
            {field('tabSize', 'Tab Size', 'number')}
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">Theme</label>
              <select
                value={current.theme ?? 'dark'}
                onChange={(e) => setForm((p) => ({ ...p, theme: e.target.value }))}
                className="w-full px-2 py-1.5 bg-background border border-input rounded text-xs focus:outline-none"
              >
                <option value="dark">Dark</option>
                <option value="light">Light</option>
                <option value="system">System</option>
              </select>
            </div>
          </div>
        </section>

        <section>
          <p className="text-xs font-semibold text-foreground mb-2">AI Model</p>
          <div className="space-y-2">
            {field('modelId', 'Model ID', 'text')}
            {field('temperature', 'Temperature', 'number')}
            {field('maxTokens', 'Max Tokens', 'number')}
          </div>
        </section>

        <button
          onClick={() => mutation.mutate(form)}
          disabled={mutation.isPending || Object.keys(form).length === 0}
          className="w-full flex items-center justify-center gap-2 py-2 bg-primary text-primary-foreground text-xs rounded hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          {mutation.isPending ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}
