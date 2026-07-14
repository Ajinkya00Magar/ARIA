// ─────────────────────────────────────────────────────────────────────────────
// Agent Router — SSE streaming endpoint for AI agent
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { agentService } from '../services/agent.service';
import { validate } from '../middleware/validate';
import { SendMessageSchema } from '@ibm-agent/shared';
import type { AgentEvent } from '@ibm-agent/types';

export const agentRouter = Router();
agentRouter.use(authenticate);

// POST /api/agent/run — SSE streaming agent run
agentRouter.post('/run', validate(SendMessageSchema), async (req: Request, res: Response) => {
  const { chatId, content, workspaceId } = req.body as {
    chatId: string;
    content: string;
    workspaceId: string;
  };

  const userId = req.user?.sub ?? 'local-user';

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Keep alive ping
  const keepAlive = setInterval(() => {
    res.write(': ping\n\n');
  }, 15_000);

  const pendingPermissions = new Map<string, (approved: boolean) => void>();

  function sendEvent(event: AgentEvent) {
    const data = JSON.stringify({ type: event.type, data: event.data, timestamp: event.timestamp });
    res.write(`data: ${data}\n\n`);
  }

  req.on('close', () => {
    clearInterval(keepAlive);
  });

  try {
    await agentService.run({
      chatId,
      workspaceId,
      userId,
      userMessage: content,
      onEvent: sendEvent,
      pendingPermissions,
    });
  } catch (err) {
    sendEvent({
      type: 'agent_error',
      data: { error: String(err), code: 'AGENT_RUN_ERROR' },
      timestamp: new Date(),
    });
  } finally {
    clearInterval(keepAlive);
    res.write('data: {"type":"stream_end"}\n\n');
    res.end();
  }
});

// POST /api/agent/permission/:requestId — respond to permission requests
agentRouter.post('/permission/:requestId', async (req: Request, res: Response) => {
  const { requestId } = req.params;
  const { approved } = req.body as { approved: boolean };

  const resolved = agentService.resolvePermission(requestId as string, approved ?? false);
  if (!resolved) {
    res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Permission request not found or already resolved' },
    });
    return;
  }

  res.json({ success: true, data: { message: `Permission ${approved ? 'approved' : 'denied'}` } });
});

// GET /api/agent/status — returns IBM Orchestrate connection status
agentRouter.get('/status', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      orchestrateEnabled: agentService.isOrchestrateEnabled,
      timestamp: new Date().toISOString(),
    },
  });
});
