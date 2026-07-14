// ─────────────────────────────────────────────────────────────────────────────
// Files Router — REST endpoints for workspace file operations
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { workspaceService } from '../services/workspace.service';
import { FileSystemTool } from '@ibm-agent/tools';

export const filesRouter = Router();
filesRouter.use(authenticate);

function getFs(workspacePath: string): FileSystemTool {
  return new FileSystemTool(workspacePath);
}

// GET /api/files/:workspaceId/tree
filesRouter.get('/:workspaceId/tree', async (req: Request, res: Response) => {
  const ws = await workspaceService.findById((req.params.workspaceId as string), req.user!.sub);
  const tree = await getFs(ws.path).readDirectory('.', 4);
  res.json({ success: true, data: { tree } });
});

// GET /api/files/:workspaceId/list
filesRouter.get('/:workspaceId/list', async (req: Request, res: Response) => {
  const ws = await workspaceService.findById((req.params.workspaceId as string), req.user!.sub);
  const filePath = (req.query.path as string) ?? '.';
  const recursive = req.query.recursive !== 'false'; // default: full tree for the explorer
  const maxDepth = Number(req.query.maxDepth) || 8;
  const files = await getFs(ws.path).listFiles(filePath, recursive, false, maxDepth);
  res.json({ success: true, data: files });
});

// GET /api/files/:workspaceId/read
filesRouter.get('/:workspaceId/read', async (req: Request, res: Response) => {
  const ws = await workspaceService.findById((req.params.workspaceId as string), req.user!.sub);
  const filePath = req.query.path as string;
  if (!filePath) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'path required' } });
    return;
  }
  const content = await getFs(ws.path).readFile(filePath);
  res.json({ success: true, data: { content, path: filePath } });
});

// POST /api/files/:workspaceId/write
filesRouter.post('/:workspaceId/write', async (req: Request, res: Response) => {
  const ws = await workspaceService.findById((req.params.workspaceId as string), req.user!.sub);
  const { path: filePath, content } = req.body as { path: string; content: string };
  const result = await getFs(ws.path).writeFile(filePath, content);
  res.json({ success: true, data: result });
});

// DELETE /api/files/:workspaceId/delete
filesRouter.delete('/:workspaceId/delete', async (req: Request, res: Response) => {
  const ws = await workspaceService.findById((req.params.workspaceId as string), req.user!.sub);
  const filePath = req.query.path as string;
  const result = await getFs(ws.path).deleteFile(filePath, req.query.recursive === 'true');
  res.json({ success: true, data: { message: result } });
});

// POST /api/files/:workspaceId/rename
filesRouter.post('/:workspaceId/rename', async (req: Request, res: Response) => {
  const ws = await workspaceService.findById((req.params.workspaceId as string), req.user!.sub);
  const { oldPath, newPath } = req.body as { oldPath: string; newPath: string };
  const result = await getFs(ws.path).renameFile(oldPath, newPath);
  res.json({ success: true, data: { message: result } });
});

// POST /api/files/:workspaceId/mkdir
filesRouter.post('/:workspaceId/mkdir', async (req: Request, res: Response) => {
  const ws = await workspaceService.findById((req.params.workspaceId as string), req.user!.sub);
  const { path: dirPath } = req.body as { path: string };
  const result = await getFs(ws.path).createFolder(dirPath);
  res.json({ success: true, data: { message: result } });
});
