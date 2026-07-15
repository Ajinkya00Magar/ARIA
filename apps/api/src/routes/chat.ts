// ─────────────────────────────────────────────────────────────────────────────
// Chat Router — chats live in <workspace>/.aria/chats.json (no database)
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { workspaceService } from '../services/workspace.service';
import { generateId } from '@ibm-agent/shared';
import { listChats, updateChats } from '../lib/store';
import { z } from 'zod';
import { validate } from '../middleware/validate';

export const chatRouter = Router();
chatRouter.use(authenticate);

const CreateChatSchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string().min(1).max(200),
});

async function resolveWorkspacePath(workspaceId: string, userId: string): Promise<string> {
  const ws = await workspaceService.findById(workspaceId, userId);
  return ws.path;
}

// GET /api/chat?workspaceId=:id
chatRouter.get('/', async (req: Request, res: Response) => {
  const workspaceId = req.query.workspaceId as string;
  if (!workspaceId) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'workspaceId required' } });
    return;
  }

  try {
    const wsPath = await resolveWorkspacePath(workspaceId, req.user!.sub);
    const chats = await listChats(wsPath);
    // Strip messages from the list payload; sort newest first
    const items = chats
      .map(({ messages: _messages, ...chat }) => chat)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    res.json({ success: true, data: items });
  } catch {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Workspace not found' } });
  }
});

// POST /api/chat
chatRouter.post('/', validate(CreateChatSchema), async (req: Request, res: Response) => {
  const { workspaceId, title } = req.body as { workspaceId: string; title: string };

  try {
    const wsPath = await resolveWorkspacePath(workspaceId, req.user!.sub);
    const now = new Date().toISOString();
    const chat = {
      id: generateId(),
      workspaceId,
      userId: req.user!.sub,
      title,
      createdAt: now,
      updatedAt: now,
      messages: [],
    };
    await updateChats(wsPath, (chats) => {
      chats.push(chat);
    });
    const { messages: _messages, ...payload } = chat;
    res.status(201).json({ success: true, data: payload });
  } catch {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Workspace not found' } });
  }
});

// GET /api/chat/:id/messages?workspaceId=:wsId
chatRouter.get('/:id/messages', async (req: Request, res: Response) => {
  const workspaceId = req.query.workspaceId as string;
  if (!workspaceId) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'workspaceId required' } });
    return;
  }

  try {
    const wsPath = await resolveWorkspacePath(workspaceId, req.user!.sub);
    const chats = await listChats(wsPath);
    const chat = chats.find((c) => c.id === req.params.id);
    if (!chat) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Chat not found' } });
      return;
    }
    res.json({ success: true, data: chat.messages });
  } catch {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Workspace not found' } });
  }
});

// DELETE /api/chat/:id?workspaceId=:wsId
chatRouter.delete('/:id', async (req: Request, res: Response) => {
  const workspaceId = req.query.workspaceId as string;
  if (!workspaceId) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'workspaceId required' } });
    return;
  }

  try {
    const wsPath = await resolveWorkspacePath(workspaceId, req.user!.sub);
    await updateChats(wsPath, (chats) => chats.filter((c) => c.id !== req.params.id));
    res.json({ success: true, data: { message: 'Chat deleted' } });
  } catch {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Workspace not found' } });
  }
});
