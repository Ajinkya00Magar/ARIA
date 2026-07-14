'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, Check, X } from 'lucide-react';
import { useState } from 'react';
import { useAgentStore } from '@/stores/agent-store';
import { useWorkspaceStore } from '@/stores/workspace-store';
import { apiClient } from '@/lib/api-client';
import { toast } from 'sonner';

export function PermissionDialog() {
  const { permissionRequest, setPermissionRequest } = useAgentStore();
  const { currentWorkspace } = useWorkspaceStore();
  const [isLoading, setIsLoading] = useState(false);

  if (!permissionRequest) return null;

  const respond = async (approved: boolean) => {
    setIsLoading(true);
    try {
      await apiClient.post(`/agent/permission/${permissionRequest.requestId}`, { approved });
      setPermissionRequest(null);
      if (!approved) toast.info('Action cancelled');
    } catch {
      toast.error('Failed to respond');
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
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="bg-card border border-border rounded-xl shadow-2xl max-w-md w-full p-6"
        >
          <div className="flex items-start gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">Permission Required</h3>
              <p className="text-muted-foreground text-xs mt-0.5">{permissionRequest.description}</p>
            </div>
          </div>

          <div className="bg-muted/40 rounded-lg p-3 mb-4">
            <p className="text-xs font-mono text-foreground">
              <span className="text-muted-foreground">Action: </span>
              <span className="font-semibold text-yellow-400">{permissionRequest.action}</span>
            </p>
            {Object.keys(permissionRequest.details).length > 0 && (
              <pre className="text-xs text-muted-foreground mt-2 overflow-auto max-h-24 whitespace-pre-wrap">
                {JSON.stringify(permissionRequest.details, null, 2)}
              </pre>
            )}
          </div>

          <p className="text-xs text-muted-foreground mb-4">
            This is a potentially destructive operation. Do you want to allow the agent to proceed?
          </p>

          <div className="flex items-center gap-3">
            <button
              onClick={() => respond(false)}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-2 py-2 border border-border rounded-lg text-sm hover:bg-muted transition-colors disabled:opacity-50"
            >
              <X className="h-4 w-4" />
              Deny
            </button>
            <button
              onClick={() => respond(true)}
              disabled={isLoading}
              className="flex-1 flex items-center justify-center gap-2 py-2 bg-primary text-primary-foreground rounded-lg text-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              <Check className="h-4 w-4" />
              Allow
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
