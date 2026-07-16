// ─────────────────────────────────────────────────────────────────────────────
// Git Router (Stubbed for Web/Serverless Mode)
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';

export const gitRouter = Router();
gitRouter.use(authenticate);

// GET /api/git/:workspaceId/status
gitRouter.get('/:workspaceId/status', async (req: Request, res: Response) => {
  res.json({ success: true, data: { branch: 'main', isClean: true, modified: [], staged: [], untracked: [] } });
});

// POST /api/git/:workspaceId/commit
gitRouter.post('/:workspaceId/commit', async (req: Request, res: Response) => {
  res.json({ success: false, error: { code: 'NOT_SUPPORTED', message: 'Git operations are disabled in web mode.' } });
});

// GET /api/git/:workspaceId/log
gitRouter.get('/:workspaceId/log', async (req: Request, res: Response) => {
  res.json({ success: true, data: [] });
});

// GET /api/git/:workspaceId/diff
gitRouter.get('/:workspaceId/diff', async (req: Request, res: Response) => {
  res.json({ success: true, data: { diff: '' } });
});

// GET /api/git/:workspaceId/branches
gitRouter.get('/:workspaceId/branches', async (req: Request, res: Response) => {
  res.json({ success: true, data: { current: 'main', branches: ['main'] } });
});

// POST /api/git/:workspaceId/checkout
gitRouter.post('/:workspaceId/checkout', async (req: Request, res: Response) => {
  res.json({ success: false, error: { code: 'NOT_SUPPORTED', message: 'Git operations are disabled in web mode.' } });
});

// POST /api/git/:workspaceId/push
gitRouter.post('/:workspaceId/push', async (req: Request, res: Response) => {
  res.json({ success: false, error: { code: 'NOT_SUPPORTED', message: 'Git operations are disabled in web mode.' } });
});

// POST /api/git/:workspaceId/pull
gitRouter.post('/:workspaceId/pull', async (req: Request, res: Response) => {
  res.json({ success: false, error: { code: 'NOT_SUPPORTED', message: 'Git operations are disabled in web mode.' } });
});
