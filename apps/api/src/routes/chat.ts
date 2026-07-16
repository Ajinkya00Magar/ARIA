// ─────────────────────────────────────────────────────────────────────────────
// Chat Router — chats live in Supabase Database
// ─────────────────────────────────────────────────────────────────────────────

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { generateId } from '@ibm-agent/shared';
import { supabase } from '../lib/supabase';
import { listChats } from '../lib/store';
import { z } from 'zod';
import { validate } from '../middleware/validate';

export const chatRouter = Router();
chatRouter.use(authenticate);

const CreateChatSchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string().min(1).max(200),
});

// GET /api/chat?workspaceId=:id
chatRouter.get('/', async (req: Request, res: Response) => {
  const workspaceId = req.query.workspaceId as string;
  if (!workspaceId) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'workspaceId required' } });
    return;
  }

  try {
    const chats = await listChats(workspaceId);
    const items = chats
      .map(({ messages: _messages, ...chat }) => chat)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Database error' } });
  }
});

// POST /api/chat
chatRouter.post('/', validate(CreateChatSchema), async (req: Request, res: Response) => {
  const { workspaceId, title } = req.body as { workspaceId: string; title: string };

  try {
    const now = new Date().toISOString();
    const chat = {
      id: generateId(),
      workspace_id: workspaceId,
      user_id: req.user!.sub,
      title,
      created_at: now,
      updated_at: now,
    };
    
    const { error } = await supabase.from('chats').insert(chat);
    if (error) throw error;
    
    res.status(201).json({ success: true, data: {
      id: chat.id,
      workspaceId: chat.workspace_id,
      userId: chat.user_id,
      title: chat.title,
      createdAt: chat.created_at,
      updatedAt: chat.updated_at
    } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Database error' } });
  }
});

// GET /api/chat/:id/messages?workspaceId=:wsId
chatRouter.get('/:id/messages', async (req: Request, res: Response) => {
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .select('*')
      .eq('chat_id', req.params.id)
      .order('created_at', { ascending: true });

    if (error) throw error;
    
    const messages = data.map(m => ({
      id: m.id,
      chatId: m.chat_id,
      role: m.role,
      content: m.content,
      toolCalls: m.tool_calls,
      toolResults: m.tool_results,
      createdAt: m.created_at
    }));

    res.json({ success: true, data: messages });
  } catch (err) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Chat not found' } });
  }
});

// DELETE /api/chat/:id?workspaceId=:wsId
chatRouter.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { error } = await supabase.from('chats').delete().eq('id', req.params.id);
    if (error) throw error;
    res.json({ success: true, data: { message: 'Chat deleted' } });
  } catch (err) {
    res.status(500).json({ success: false, error: { code: 'SERVER_ERROR', message: 'Database error' } });
  }
});
