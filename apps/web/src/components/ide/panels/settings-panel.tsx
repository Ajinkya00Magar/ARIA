'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Save, Zap, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

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
  const [orchestrateStatus, setOrchestrateStatus] = useState<'idle' | 'checking' | 'connected' | 'offline'>('idle');

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

  const checkOrchestrate = async () => {
    setOrchestrateStatus('checking');
    try {
      const res = await apiClient.get<{ data: { orchestrateEnabled: boolean } }>('/agent/status');
      setOrchestrateStatus(res.data.data.orchestrateEnabled ? 'connected' : 'offline');
    } catch {
      setOrchestrateStatus('offline');
    }
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-3 py-2 border-b border-[#262626] shrink-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#525252]">Settings</p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-5">

        {/* IBM Orchestrate Status */}
        <section>
          <p className="text-[11px] font-semibold text-[#a8a8a8] mb-2 flex items-center gap-1.5">
            <Zap className="h-3 w-3 text-[#4589ff]" />
            IBM watsonx Orchestrate
          </p>
          <div className="bg-[#1a1a1a] border border-[#262626] rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-[#6f6f6f]">Connection status</span>
              {orchestrateStatus === 'idle' && (
                <span className="text-[11px] text-[#525252]">Not checked</span>
              )}
              {orchestrateStatus === 'checking' && (
                <span className="flex items-center gap-1 text-[11px] text-[#4589ff]">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Checking…
                </span>
              )}
              {orchestrateStatus === 'connected' && (
                <span className="flex items-center gap-1 text-[11px] text-[#24a148]">
                  <CheckCircle className="h-3 w-3" />
                  Connected
                </span>
              )}
              {orchestrateStatus === 'offline' && (
                <span className="flex items-center gap-1 text-[11px] text-[#f1c21b]">
                  <AlertCircle className="h-3 w-3" />
                  Not configured
                </span>
              )}
            </div>
            <button
              onClick={() => void checkOrchestrate()}
              disabled={orchestrateStatus === 'checking'}
              className="w-full py-1.5 text-[11px] text-[#4589ff] border border-[#0f62fe]/25 rounded-lg hover:bg-[#0f62fe]/8 transition-colors disabled:opacity-50"
            >
              Test Connection
            </button>
          </div>
        </section>

        {/* Editor settings */}
        <section>
          <p className="text-[11px] font-semibold text-[#a8a8a8] mb-2">Editor</p>
          <div className="space-y-2.5">
            <SettingsField
              label="Font Size"
              value={String(current.fontSize ?? 14)}
              type="number"
              onChange={(v) => setForm((p) => ({ ...p, fontSize: Number(v) }))}
            />
            <SettingsField
              label="Tab Size"
              value={String(current.tabSize ?? 2)}
              type="number"
              onChange={(v) => setForm((p) => ({ ...p, tabSize: Number(v) }))}
            />
            <div>
              <label className="text-[11px] text-[#6f6f6f] block mb-1">Theme</label>
              <select
                value={current.theme ?? 'dark'}
                onChange={(e) => setForm((p) => ({ ...p, theme: e.target.value }))}
                className="w-full px-2.5 py-1.5 bg-[#1a1a1a] border border-[#262626] rounded-lg text-[12px] text-[#c6c6c6] focus:outline-none focus:border-[#0f62fe]/50 transition-colors"
              >
                <option value="dark">Dark (ARIA)</option>
                <option value="system">System</option>
              </select>
            </div>
          </div>
        </section>

        {/* AI model */}
        <section>
          <p className="text-[11px] font-semibold text-[#a8a8a8] mb-2">AI Agent</p>
          <div className="space-y-2.5">
            <SettingsField
              label="Model ID"
              value={current.modelId ?? ''}
              type="text"
              onChange={(v) => setForm((p) => ({ ...p, modelId: v }))}
              placeholder="e.g. ibm/granite-34b-code-instruct"
            />
            <SettingsField
              label="Temperature"
              value={String(current.temperature ?? 0.2)}
              type="number"
              onChange={(v) => setForm((p) => ({ ...p, temperature: Number(v) }))}
            />
            <SettingsField
              label="Max Tokens"
              value={String(current.maxTokens ?? 4096)}
              type="number"
              onChange={(v) => setForm((p) => ({ ...p, maxTokens: Number(v) }))}
            />
          </div>
        </section>

        <button
          onClick={() => mutation.mutate(form)}
          disabled={mutation.isPending || Object.keys(form).length === 0}
          className={cn(
            'w-full flex items-center justify-center gap-2 py-2 text-[12px] rounded-lg transition-colors',
            Object.keys(form).length > 0
              ? 'bg-[#0f62fe] text-white hover:bg-[#0353e9]'
              : 'bg-[#1a1a1a] text-[#525252] border border-[#262626] cursor-not-allowed',
          )}
        >
          <Save className="h-3.5 w-3.5" />
          {mutation.isPending ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

function SettingsField({
  label,
  value,
  type,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  type: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-[11px] text-[#6f6f6f] block mb-1">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2.5 py-1.5 bg-[#1a1a1a] border border-[#262626] rounded-lg text-[12px] text-[#c6c6c6] focus:outline-none focus:border-[#0f62fe]/50 transition-colors placeholder:text-[#3d3d3d]"
      />
    </div>
  );
}
