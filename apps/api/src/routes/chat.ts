// ─────────────────────────────────────────────────────────────────────────────
// Chat Router
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from 'express';
import { eq, and, desc } from 'drizzle-orm';
import { authenticate } from '../middleware/auth';
import { getDb } from '../db/connection';
import { chats, messages } from '../db/schema';
import { generateId } from '@ibm-agent/shared';
import { z } from 'zod';
import { validate } from '../middleware/validate';

export const chatRouter = Router();
chatRouter.use(authenticate);

const CreateChatSchema = z.object({
  workspaceId: z.string().uuid(),
  title: z.string().min(1).max(200),
});

// GET /api/chat?workspaceId=:id
chatRouter.get('/', async (req: Request, res: Response) => {
  const workspaceId = req.query.workspaceId as string;
  if (!workspaceId) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'workspaceId required' } });
    return;
  }

  const db = getDb();
  const items = await db
    .select()
    .from(chats)
    .where(and(eq(chats.workspaceId, workspaceId), eq(chats.userId, req.user!.sub)))
    .orderBy(desc(chats.updatedAt));

  res.json({ success: true, data: items });
});

// POST /api/chat
chatRouter.post('/', validate(CreateChatSchema), async (req: Request, res: Response) => {
  const { workspaceId, title } = req.body as { workspaceId: string; title: string };
  const db = getDb();

  const [chat] = await db
    .insert(chats)
    .values({ id: generateId(), workspaceId, userId: req.user!.sub, title })
    .returning();

  res.status(201).json({ success: true, data: chat });
});

// GET /api/chat/:id/messages
chatRouter.get('/:id/messages', async (req: Request, res: Response) => {
  const db = getDb();
  const [chat] = await db
    .select()
    .from(chats)
    .where(and(eq(chats.id, req.params.id as string), eq(chats.userId, req.user!.sub)))
    .limit(1);

  if (!chat) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Chat not found' } });
    return;
  }

  const msgs = await db
    .select()
    .from(messages)
    .where(eq(messages.chatId, req.params.id as string))
    .orderBy(messages.createdAt);

  res.json({ success: true, data: msgs });
});

// DELETE /api/chat/:id
chatRouter.delete('/:id', async (req: Request, res: Response) => {
  const db = getDb();
  await db.delete(chats).where(and(eq(chats.id, req.params.id as string), eq(chats.userId, req.user!.sub)));
  res.json({ success: true, data: { message: 'Chat deleted' } });
});
