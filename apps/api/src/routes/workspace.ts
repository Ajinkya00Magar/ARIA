// ─────────────────────────────────────────────────────────────────────────────
// Workspace Router
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { workspaceService } from '../services/workspace.service';
import { CreateWorkspaceSchema, UpdateWorkspaceSchema } from '@ibm-agent/shared';
import { z } from 'zod';
import { FileSystemTool } from '@ibm-agent/tools';
const archiver = require('archiver');

export const workspaceRouter = Router();
workspaceRouter.use(authenticate);

// GET /api/workspaces
workspaceRouter.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await workspaceService.findAll(req.user!.sub as string);
    res.json({ success: true, data: items });
  } catch (err) {
    next(err);
  }
});

// POST /api/workspaces
workspaceRouter.post('/', validate(CreateWorkspaceSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspace = await workspaceService.create(req.user!.sub as string, req.body);
    res.status(201).json({ success: true, data: workspace });
  } catch (err) {
    next(err);
  }
});

// GET /api/workspaces/:id
workspaceRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspace = await workspaceService.findById(req.params.id as string, req.user!.sub as string);
    await workspaceService.updateLastOpened(req.params.id as string);
    res.json({ success: true, data: workspace });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/workspaces/:id
workspaceRouter.patch('/:id', validate(UpdateWorkspaceSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const workspace = await workspaceService.update(req.params.id as string, req.user!.sub as string, req.body);
    res.json({ success: true, data: workspace });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/workspaces/:id
workspaceRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await workspaceService.delete(req.params.id as string, req.user!.sub as string);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// POST /api/workspaces/:id/pin
workspaceRouter.post('/:id/pin', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { pin } = req.body as { pin: boolean };
    const workspace = await workspaceService.pin(req.params.id as string, req.user!.sub as string, pin ?? true);
    res.json({ success: true, data: workspace });
  } catch (err) {
    next(err);
  }
});

// POST /api/workspaces/:id/analyze
workspaceRouter.post('/:id/analyze', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const summary = await workspaceService.analyze(req.params.id as string, req.user!.sub as string);
    res.json({ success: true, data: summary });
  } catch (err) {
    next(err);
  }
});

// GET /api/workspaces/:id/download
workspaceRouter.get('/:id/download', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const record = await workspaceService.getRecord(req.params.id as string, req.user!.sub as string);
    if (!record) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Workspace not found' } });
      return;
    }

    res.setHeader('Content-Disposition', `attachment; filename="${record.name}.zip"`);
    res.setHeader('Content-Type', 'application/zip');

    const archive = (archiver as any)('zip', { zlib: { level: 9 } });
    archive.pipe(res);

    const fsTool = new FileSystemTool(record.path, req.headers.authorization);

    async function addDirectoryToArchive(fs: FileSystemTool, currentDir = '.') {
      const items = await fs.listFiles(currentDir, false, true);
      for (const item of items) {
        if (
          item.name === 'node_modules' ||
          item.name === '.git' ||
          item.name === '.next' ||
          item.name === 'dist' ||
          item.name === '.keep'
        ) {
          continue;
        }

        if (item.type === 'file') {
          try {
            const fileData = await fs.readFile(item.path, 'base64');
            const buffer = Buffer.from(fileData, 'base64');
            archive.append(buffer, { name: item.path });
          } catch (e) {
            console.error(`Failed to read file ${item.path} for zipping`, e);
          }
        } else if (item.type === 'directory') {
          await addDirectoryToArchive(fs, item.path);
        }
      }
    }

    await addDirectoryToArchive(fsTool);
    await archive.finalize();
  } catch (err) {
    next(err);
  }
});
