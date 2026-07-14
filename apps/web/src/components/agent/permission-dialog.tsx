'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Check, X, Shield } from 'lucide-react';
import { useState } from 'react';
import { useAgentStore } from '@/stores/agent-store';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';

export function PermissionDialog() {
  const { permissionRequest, setPermissionRequest } = useAgentStore();
  const [isLoading, setIsLoading] = useState(false);

  if (!permissionRequest) return null;

  const respond = async (approved: boolean) => {
    setIsLoading(true);
    try {
      await apiClient.post(`/agent/permission/${permissionRequest.requestId}`, { approved });
      setPermissionRequest(null);
      if (!approved) toast.info('Action denied');
    } catch {
      toast.error('Failed to respond to permission request');
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
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      >
        <motion.div
          initial={{ y: 20, opacity: 0, scale: 0.97 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: 20, opacity: 0, scale: 0.97 }}
          transition={{ duration: 0.18 }}
          className="bg-[#1a1a1a] border border-[#393939] rounded-2xl shadow-2xl max-w-md w-full overflow-hidden"
        >
          {/* Header bar */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-[#262626]">
            <div className="w-9 h-9 rounded-xl bg-[#f1c21b]/10 border border-[#f1c21b]/20 flex items-center justify-center shrink-0">
              <Shield className="h-4.5 w-4.5 text-[#f1c21b]" />
            </div>
            <div>
              <h3 className="text-[13px] font-semibold text-white">Permission Required</h3>
              <p className="text-[11px] text-[#6f6f6f] mt-0.5">ARIA is requesting approval to continue</p>
            </div>
          </div>

          <div className="p-5 space-y-4">
            {/* Description */}
            <p className="text-[12px] text-[#a8a8a8] leading-relaxed">
              {permissionRequest.description}
            </p>

            {/* Action details */}
            <div className="bg-[#0e0e0e] border border-[#262626] rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-3 w-3 text-[#f1c21b] shrink-0" />
                <span className="text-[11px] font-mono text-[#f1c21b] font-semibold">
                  {permissionRequest.action}
                </span>
              </div>
              {Object.keys(permissionRequest.details).length > 0 && (
                <pre className="text-[10px] font-mono text-[#6f6f6f] mt-1 overflow-auto max-h-20 whitespace-pre-wrap leading-relaxed">
                  {JSON.stringify(permissionRequest.details, null, 2)}
                </pre>
              )}
            </div>

            <p className="text-[11px] text-[#525252] leading-relaxed">
              This action may modify or delete files. Review carefully before allowing.
            </p>

            {/* Buttons */}
            <div className="flex items-center gap-2.5 pt-1">
              <button
                onClick={() => void respond(false)}
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-[#393939] rounded-xl text-[12px] text-[#a8a8a8] hover:bg-[#262626] hover:text-white transition-colors disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" />
                Deny
              </button>
              <button
                onClick={() => void respond(true)}
                disabled={isLoading}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-[#f1c21b] text-[#161616] rounded-xl text-[12px] font-semibold hover:bg-[#f1c21b]/90 transition-colors disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" />
                Allow
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
