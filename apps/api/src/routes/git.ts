// ─────────────────────────────────────────────────────────────────────────────
// Git Router
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { workspaceService } from '../services/workspace.service';
import { GitTool } from '@ibm-agent/tools';

export const gitRouter = Router();
gitRouter.use(authenticate);

function getGit(workspacePath: string): GitTool {
  return new GitTool(workspacePath);
}

// GET /api/git/:workspaceId/status
gitRouter.get('/:workspaceId/status', async (req: Request, res: Response, next) => {
  try {
    const ws = await workspaceService.findById((req.params.workspaceId as string), req.user!.sub);
    const status = await getGit(ws.path).status();
    res.json({ success: true, data: status });
  } catch (err: any) {
    if (err.name === 'ToolExecutionError' && err.message.includes('not a git repository')) {
      res.json({ success: true, data: { branch: '', isClean: true, modified: [], staged: [], untracked: [] } });
    } else {
      next(err);
    }
  }
});

// POST /api/git/:workspaceId/commit
gitRouter.post('/:workspaceId/commit', async (req: Request, res: Response) => {
  const ws = await workspaceService.findById((req.params.workspaceId as string), req.user!.sub);
  const { message, files, push } = req.body as { message: string; files?: string[]; push?: boolean };
  const result = await getGit(ws.path).commit(message, files, push);
  res.json({ success: true, data: { message: result } });
});

// GET /api/git/:workspaceId/log
gitRouter.get('/:workspaceId/log', async (req: Request, res: Response) => {
  const ws = await workspaceService.findById((req.params.workspaceId as string), req.user!.sub);
  const limit = parseInt(req.query.limit as string) || 20;
  const commits = await getGit(ws.path).log(limit);
  res.json({ success: true, data: commits });
});

// GET /api/git/:workspaceId/diff
gitRouter.get('/:workspaceId/diff', async (req: Request, res: Response) => {
  const ws = await workspaceService.findById((req.params.workspaceId as string), req.user!.sub);
  const diff = await getGit(ws.path).diff(
    req.query.path as string | undefined,
    req.query.staged === 'true',
  );
  res.json({ success: true, data: { diff } });
});

// GET /api/git/:workspaceId/branches
gitRouter.get('/:workspaceId/branches', async (req: Request, res: Response) => {
  const ws = await workspaceService.findById((req.params.workspaceId as string), req.user!.sub);
  const branches = await getGit(ws.path).branch('list');
  res.json({ success: true, data: branches });
});

// POST /api/git/:workspaceId/checkout
gitRouter.post('/:workspaceId/checkout', async (req: Request, res: Response) => {
  const ws = await workspaceService.findById((req.params.workspaceId as string), req.user!.sub);
  const { branch, create } = req.body as { branch: string; create?: boolean };
  const result = await getGit(ws.path).checkout(branch, create);
  res.json({ success: true, data: { message: result } });
});

// POST /api/git/:workspaceId/push
gitRouter.post('/:workspaceId/push', async (req: Request, res: Response) => {
  const ws = await workspaceService.findById((req.params.workspaceId as string), req.user!.sub);
  const result = await getGit(ws.path).push();
  res.json({ success: true, data: { message: result } });
});

// POST /api/git/:workspaceId/pull
gitRouter.post('/:workspaceId/pull', async (req: Request, res: Response) => {
  const ws = await workspaceService.findById((req.params.workspaceId as string), req.user!.sub);
  const result = await getGit(ws.path).pull();
  res.json({ success: true, data: { message: result } });
});
