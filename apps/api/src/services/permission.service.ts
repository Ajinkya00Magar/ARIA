// ─────────────────────────────────────────────────────────────────────────────
// Permission Service — Handles destructive action confirmation flow
// Emits a `permission_request` event to the UI and resolves when the user
// responds via POST /api/agent/permission/:requestId (or times out → deny).
// ─────────────────────────────────────────────────────────────────────────────

import { generateId } from '@ibm-agent/shared';
import { PERMISSION_TIMEOUT_MS } from '@ibm-agent/shared';
import type { AgentEvent } from '@ibm-agent/types';

class PermissionService {
  /** Global registry so the /permission/:requestId route can resolve requests */
  private readonly pending = new Map<string, (approved: boolean) => void>();

  async request(
    pendingMap: Map<string, (approved: boolean) => void>,
    action: string,
    description: string,
    details: Record<string, unknown>,
    onEvent?: (event: AgentEvent) => void,
  ): Promise<boolean> {
    const requestId = generateId();

    return new Promise<boolean>((resolve) => {
      const finish = (approved: boolean) => {
        this.pending.delete(requestId);
        pendingMap.delete(requestId);
        resolve(approved);
      };

      this.pending.set(requestId, finish);
      pendingMap.set(requestId, finish);

      // Tell the UI to show the Allow/Deny dialog
      onEvent?.({
        type: 'permission_request',
        data: {
          requestId,
          action,
          description,
          details,
          timeout: PERMISSION_TIMEOUT_MS,
        },
        timestamp: new Date(),
      });

      // Auto-deny after timeout
      setTimeout(() => {
        if (this.pending.has(requestId)) {
          finish(false);
        }
      }, PERMISSION_TIMEOUT_MS);
    });
  }

  resolve(requestId: string, approved: boolean): boolean {
    const finish = this.pending.get(requestId);
    if (!finish) return false;
    finish(approved);
    return true;
  }
}

export const permissionService = new PermissionService();
