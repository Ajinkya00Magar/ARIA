import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { ToolExecutor } from '@ibm-agent/tools';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { workspaceService } from '../services/workspace.service';
import type { ToolName } from '@ibm-agent/types';

export const toolRouter = Router();
toolRouter.use(authenticate);

const ExecuteToolSchema = z.object({
  workspaceId: z.string().min(1),
  toolName: z.string().min(1),
  arguments: z.record(z.unknown()),
});

toolRouter.post('/execute', validate(ExecuteToolSchema), async (req: Request, res: Response) => {
  const { workspaceId, toolName, arguments: args } = req.body;

  try {
    const record = await workspaceService.getRecord(workspaceId, req.user!.sub);
    if (!record) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Workspace not found locally' } });
      return;
    }

    // TODO: Handle permissions properly for local execution if needed.
    // For now, assume the desktop app user implicitly allows execution since they ran the app.
    const executor = new ToolExecutor(record.path, req.headers.authorization);

    const output = await executor.execute(toolName as ToolName, args);
    res.json({ success: true, data: { output } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'TOOL_ERROR', message: String(err) } });
  }
});
