// Tasks, Settings, Metrics routers
import { Router, Request, Response } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { getDb } from '../db/connection';
import { tasks, userSettings } from '../db/schema';

// ── Tasks Router ───────────────────────────────────────────────────────────────

export const taskRouter = Router();
taskRouter.use(authenticate);

taskRouter.get('/', async (req: Request, res: Response) => {
  const workspaceId = req.query.workspaceId as string;
  const db = getDb();
  const items = workspaceId
    ? await db.select().from(tasks).where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.userId, req.user!.sub))).orderBy(desc(tasks.createdAt))
    : await db.select().from(tasks).where(eq(tasks.userId, req.user!.sub)).orderBy(desc(tasks.createdAt));
  res.json({ success: true, data: items });
});

taskRouter.get('/:id', async (req: Request, res: Response) => {
  const db = getDb();
  const [task] = await db.select().from(tasks).where(and(eq(tasks.id, req.params.id as string), eq(tasks.userId, req.user!.sub))).limit(1);
  if (!task) { res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Task not found' } }); return; }
  res.json({ success: true, data: task });
});

taskRouter.delete('/:id', async (req: Request, res: Response) => {
  const db = getDb();
  await db.delete(tasks).where(and(eq(tasks.id, req.params.id as string), eq(tasks.userId, req.user!.sub)));
  res.json({ success: true, data: { message: 'Task deleted' } });
});

// ── Settings Router ────────────────────────────────────────────────────────────

export const settingsRouter = Router();
settingsRouter.use(authenticate);

settingsRouter.get('/', async (req: Request, res: Response) => {
  const db = getDb();
  const [settings] = await db.select().from(userSettings).where(eq(userSettings.userId, req.user!.sub)).limit(1);
  res.json({ success: true, data: settings ?? {} });
});

settingsRouter.put('/', async (req: Request, res: Response) => {
  const db = getDb();
  const userId = req.user!.sub;
  const updates = req.body as Partial<typeof userSettings.$inferInsert>;

  const [existing] = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);

  if (existing) {
    const [updated] = await db.update(userSettings).set({ ...updates, updatedAt: new Date() }).where(eq(userSettings.userId, userId)).returning();
    res.json({ success: true, data: updated });
  } else {
    const [created] = await db.insert(userSettings).values({ userId, ...updates }).returning();
    res.json({ success: true, data: created });
  }
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
