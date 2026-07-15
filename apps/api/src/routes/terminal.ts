// ─────────────────────────────────────────────────────────────────────────────
// Terminal Router — sessions are in-memory only (the live terminal is the
// socket.io PTY in lib/terminal-socket.ts; these REST sessions are legacy)
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { workspaceService } from '../services/workspace.service';
import { TerminalTool } from '@ibm-agent/tools';
import { generateId } from '@ibm-agent/shared';

export const terminalRouter = Router();
terminalRouter.use(authenticate);

const runningProcesses = new Map<string, TerminalTool>();

interface TerminalSession {
  id: string;
  workspaceId: string;
  userId: string;
  name: string;
  status: string;
  cwd: string;
  output: unknown[];
  createdAt: string;
}

// In-memory session store — cleared on app restart, which is fine for a
// local desktop terminal
const sessions = new Map<string, TerminalSession>();

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
terminalRouter.get('/:workspaceId/sessions', (req: Request, res: Response) => {
  const { workspaceId } = req.params as { workspaceId: string };
  const items = [...sessions.values()]
    .filter((s) => s.workspaceId === workspaceId && s.userId === req.user!.sub)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  res.json({ success: true, data: items });
});

// POST /api/terminal/:workspaceId/sessions
terminalRouter.post('/:workspaceId/sessions', async (req: Request, res: Response) => {
  const { workspaceId } = req.params as { workspaceId: string };
  const ws = await workspaceService.findById(workspaceId, req.user!.sub);
  const session: TerminalSession = {
    id: generateId(),
    workspaceId: ws.id,
    userId: req.user!.sub,
    name: req.body.name || 'Terminal',
    status: 'idle',
    cwd: ws.path,
    output: [],
    createdAt: new Date().toISOString(),
  };
  sessions.set(session.id, session);
  res.json({ success: true, data: session });
});

// PUT /api/terminal/:workspaceId/sessions/:id/output
terminalRouter.put('/:workspaceId/sessions/:id/output', (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const session = sessions.get(id);
  if (session && session.userId === req.user!.sub) {
    session.output = req.body.output ?? [];
  }
  res.json({ success: true, data: session ?? null });
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
