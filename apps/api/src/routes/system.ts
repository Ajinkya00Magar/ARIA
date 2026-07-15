// ─────────────────────────────────────────────────────────────────────────────
// System Router — desktop integration endpoints.
// The API runs inside the Electron main process in production, so it can show
// native OS dialogs (folder picker) directly.
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';

export const systemRouter = Router();
systemRouter.use(authenticate);

// POST /api/system/pick-folder → opens the native "Select Folder" dialog.
// The user explicitly grants access to a folder by picking it — nothing on
// the disk is touched without this user action.
systemRouter.post('/pick-folder', async (_req: Request, res: Response) => {
  try {
    // Only available when running inside Electron
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { dialog, BrowserWindow } = require('electron');
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? undefined;
    const result = await dialog.showOpenDialog(win, {
      title: 'Open Folder',
      buttonLabel: 'Open Folder',
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      res.json({ success: true, data: { canceled: true, path: null } });
      return;
    }
    res.json({ success: true, data: { canceled: false, path: result.filePaths[0] } });
  } catch {
    // Not running inside Electron (dev browser) — client falls back to
    // manual path input
    res.json({ success: true, data: { canceled: false, path: null, unsupported: true } });
  }
});
