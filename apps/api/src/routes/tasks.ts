// Tasks, Settings, Metrics routers — file-based storage (no database)
import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { getSettings, updateSettings } from '../lib/store';

// ── Tasks Router ───────────────────────────────────────────────────────────────
// Tasks were never created anywhere in the old system; keep the endpoints for
// UI compatibility but back them with nothing.

export const taskRouter = Router();
taskRouter.use(authenticate);

taskRouter.get('/', (_req: Request, res: Response) => {
  res.json({ success: true, data: [] });
});

taskRouter.get('/:id', (_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } });
});

taskRouter.delete('/:id', (_req: Request, res: Response) => {
  res.json({ success: true, data: { message: 'Task deleted' } });
});

// ── Settings Router ────────────────────────────────────────────────────────────

export const settingsRouter = Router();
settingsRouter.use(authenticate);

settingsRouter.get('/', async (_req: Request, res: Response) => {
  const settings = await getSettings();
  res.json({ success: true, data: settings });
});

settingsRouter.put('/', async (req: Request, res: Response) => {
  const updated = await updateSettings(req.body ?? {});
  res.json({ success: true, data: updated });
});

// ── Metrics Router ─────────────────────────────────────────────────────────────

export const metricsRouter = Router();
metricsRouter.use(authenticate);

metricsRouter.get('/health', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      nodeVersion: process.version,
      timestamp: new Date().toISOString(),
    },
  });
});
