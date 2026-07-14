// ─────────────────────────────────────────────────────────────────────────────
// Permission Service — Handles destructive action confirmation flow
// ─────────────────────────────────────────────────────────────────────────────

import { generateId } from '@ibm-agent/shared';
import { PERMISSION_TIMEOUT_MS } from '@ibm-agent/shared';

class PermissionService {
  async request(
    pendingMap: Map<string, (approved: boolean) => void>,
    action: string,
    description: string,
    details: Record<string, unknown>,
  ): Promise<boolean> {
    const requestId = generateId();

    return new Promise<boolean>((resolve) => {
      pendingMap.set(requestId, resolve);

      // Auto-deny after timeout
      setTimeout(() => {
        if (pendingMap.has(requestId)) {
          pendingMap.delete(requestId);
          resolve(false);
        }
      }, PERMISSION_TIMEOUT_MS);
    });
  }

  resolve(requestId: string, approved: boolean): boolean {
    // This would be called with the actual pending map
    // In practice, maps are per-SSE-connection, so resolution is via agent route
    return false; // stub — actual resolution done via pendingPermissions in agent route
  }
}

export const permissionService = new PermissionService();
