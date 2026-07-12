// ─────────────────────────────────────────────────────────────────────────────
// Shared Zod Validators
// ─────────────────────────────────────────────────────────────────────────────

import { z } from 'zod';

export const WorkspaceIdSchema = z.string().uuid();
export const UserIdSchema = z.string().uuid();
export const ChatIdSchema = z.string().uuid();

export const CreateWorkspaceSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  path: z.string().optional(),
  gitUrl: z.string().url().optional(),
  gitBranch: z.string().optional(),
});

export const UpdateWorkspaceSchema = CreateWorkspaceSchema.partial();

export const CreateChatSchema = z.object({
  workspaceId: z.string().uuid(),
  title: z.string().min(1).max(200),
});

export const SendMessageSchema = z.object({
  chatId: z.string().optional().default(''),
  content: z.string().min(1).max(32000),
  workspaceId: z.string().optional().default(''),
});

export const RegisterSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8)
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*])/, {
      message: 'Password must contain uppercase, lowercase, number and special character',
    }),
  name: z.string().min(2).max(100),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const UpdateSettingsSchema = z.object({
  theme: z.enum(['dark', 'light', 'system']).optional(),
  fontSize: z.number().min(10).max(32).optional(),
  tabSize: z.number().min(1).max(8).optional(),
  autoSave: z.boolean().optional(),
  modelId: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().min(100).max(16384).optional(),
  githubToken: z.string().optional(),
});

export const PaginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  pageSize: z.coerce.number().min(1).max(100).default(20),
});

export const TerminalCommandSchema = z.object({
  sessionId: z.string().uuid(),
  command: z.string().min(1).max(8192),
});

export const PermissionResponseSchema = z.object({
  requestId: z.string().uuid(),
  approved: z.boolean(),
});

export type CreateWorkspaceInput = z.infer<typeof CreateWorkspaceSchema>;
export type UpdateWorkspaceInput = z.infer<typeof UpdateWorkspaceSchema>;
export type CreateChatInput = z.infer<typeof CreateChatSchema>;
export type SendMessageInput = z.infer<typeof SendMessageSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type UpdateSettingsInput = z.infer<typeof UpdateSettingsSchema>;
export type PaginationInput = z.infer<typeof PaginationSchema>;
export type TerminalCommandInput = z.infer<typeof TerminalCommandSchema>;
export type PermissionResponseInput = z.infer<typeof PermissionResponseSchema>;
