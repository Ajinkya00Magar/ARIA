// ─────────────────────────────────────────────────────────────────────────────
// Terminal Router
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { workspaceService } from '../services/workspace.service';
import { TerminalTool } from '@ibm-agent/tools';
import { getDb } from '../db/connection';
import { terminalSessions } from '../db/schema';
import { eq, and } from 'drizzle-orm';
import { generateId } from '@ibm-agent/shared';

export const terminalRouter = Router();
terminalRouter.use(authenticate);

const runningProcesses = new Map<string, TerminalTool>();

function getTerminal(workspaceId: string, workspacePath: string): TerminalTool {
  if (!runningProcesses.has(workspaceId)) {
    runningProcesses.set(
      workspaceId,
      new TerminalTool(workspacePath, async () => true), // permissive for terminal route
    );
  }
  return runningProcesses.get(workspaceId)!;
}

// GET /api/terminal/:workspaceId/sessions
terminalRouter.get('/:workspaceId/sessions', async (req: Request, res: Response) => {
  const db = getDb();
  const { workspaceId } = req.params as { workspaceId: string };
  const sessions = await db
    .select()
    .from(terminalSessions)
    .where(and(eq(terminalSessions.workspaceId, workspaceId), eq(terminalSessions.userId, req.user!.sub)))
    .orderBy(terminalSessions.createdAt);
  res.json({ success: true, data: sessions });
});

// POST /api/terminal/:workspaceId/sessions
terminalRouter.post('/:workspaceId/sessions', async (req: Request, res: Response) => {
  const { workspaceId } = req.params as { workspaceId: string };
  const ws = await workspaceService.findById(workspaceId, req.user!.sub);
  const db = getDb();
  const [session] = await db
    .insert(terminalSessions)
    .values({
      id: generateId(),
      workspaceId: ws.id,
      userId: req.user!.sub,
      name: req.body.name || 'Terminal',
      cwd: ws.path,
      output: [],
    })
    .returning();
  res.json({ success: true, data: session });
});

// PUT /api/terminal/:workspaceId/sessions/:id/output
terminalRouter.put('/:workspaceId/sessions/:id/output', async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const db = getDb();
  const { output } = req.body;
  const [session] = await db
    .update(terminalSessions)
    .set({ output })
    .where(and(eq(terminalSessions.id, id), eq(terminalSessions.userId, req.user!.sub)))
    .returning();
  res.json({ success: true, data: session });
});

// POST /api/terminal/:workspaceId/exec
terminalRouter.post('/:workspaceId/exec', async (req: Request, res: Response) => {
  const ws = await workspaceService.findById(req.params.workspaceId as string, req.user!.sub as string);
  const { command, cwd, timeout } = req.body as { command: string; cwd?: string; timeout?: number };

  const terminal = getTerminal(req.params.workspaceId as string, ws.path);
  const result = await terminal.execute(command, cwd ?? '.', timeout ?? 30_000);

  res.json({ success: true, data: result });
});

// GET /api/terminal/:workspaceId/processes
terminalRouter.get('/:workspaceId/processes', async (req: Request, res: Response) => {
  const ws = await workspaceService.findById(req.params.workspaceId as string, req.user!.sub as string);
  const terminal = getTerminal(req.params.workspaceId as string, ws.path);
  res.json({ success: true, data: terminal.getRunningProcesses() });
});

// DELETE /api/terminal/:workspaceId/processes/:processId
terminalRouter.delete('/:workspaceId/processes/:processId', async (req: Request, res: Response) => {
  const ws = await workspaceService.findById(req.params.workspaceId as string, req.user!.sub as string);
  const terminal = getTerminal(req.params.workspaceId as string, ws.path);
  const result = await terminal.stopProcess(req.params.processId as string);
  res.json({ success: true, data: { message: result } });
});
