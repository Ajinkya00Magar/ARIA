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
  const { chatId, content, workspaceId, chatHistory, isContinuation } = req.body as {
    chatId: string;
    content: string;
    workspaceId: string;
    chatHistory?: any[];
    isContinuation?: boolean;
  };

  const userId = req.user?.sub;
  if (!userId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not authenticated' } });
    return;
  }

  // If we are proxying to Cloud, skip the local prompt check; Cloud will do it.
  // Also, if this is a continuation of a run (tool call loop), do not charge an extra prompt.
  if (!env.CLOUD_PROXY_URL && !isContinuation) {
    // Check usage limit
    const { supabase } = require('../lib/supabase');
    const { data: profile, error: dbError } = await supabase
      .from('profiles')
      .select('prompt_count')
      .eq('id', userId)
      .single();

    if (dbError || !profile) {
      res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch user profile' } });
      return;
    }

    if (profile.prompt_count >= 10) {
      res.status(429).json({ success: false, error: { code: 'RATE_LIMIT', message: 'Free usage limit reached. Maximum 10 prompts allowed.' } });
      return;
    }

    // Increment usage limit
    await supabase
      .from('profiles')
      .update({ prompt_count: profile.prompt_count + 1 })
      .eq('id', userId);
  }
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
      token: req.headers.authorization,
      chatHistory,
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
