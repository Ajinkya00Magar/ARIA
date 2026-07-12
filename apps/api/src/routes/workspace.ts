// ─────────────────────────────────────────────────────────────────────────────
// Workspace Router
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';
import { workspaceService } from '../services/workspace.service';
import { CreateWorkspaceSchema, UpdateWorkspaceSchema } from '@ibm-agent/shared';
import { z } from 'zod';

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
