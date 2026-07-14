// ─────────────────────────────────────────────────────────────────────────────
// Database Schema — Drizzle ORM (SQLite)
// ─────────────────────────────────────────────────────────────────────────────

import {
  sqliteTable,
  text,
  integer,
  real,
  uniqueIndex,
  index,
} from 'drizzle-orm/sqlite-core';

// Helper for generating UUIDs since SQLite doesn't have a native uuid type
import { v4 as uuidv4 } from 'uuid';

// ── Users ─────────────────────────────────────────────────────────────────────

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey().$defaultFn(() => uuidv4()),
    email: text('email').notNull(),
    name: text('name').notNull(),
    passwordHash: text('password_hash'),
    avatarUrl: text('avatar_url'),
    role: text('role').notNull().default('developer'),
    provider: text('provider').notNull().default('local'),
    providerId: text('provider_id'),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    emailIdx: uniqueIndex('users_email_idx').on(t.email),
    providerIdx: index('users_provider_idx').on(t.provider, t.providerId),
  }),
);

// ── Refresh Tokens ────────────────────────────────────────────────────────────

export const refreshTokens = sqliteTable(
  'refresh_tokens',
  {
    id: text('id').primaryKey().$defaultFn(() => uuidv4()),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    revokedAt: integer('revoked_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    tokenIdx: uniqueIndex('refresh_tokens_token_idx').on(t.token),
    userIdx: index('refresh_tokens_user_idx').on(t.userId),
  }),
);

// ── Workspaces ────────────────────────────────────────────────────────────────

export const workspaces = sqliteTable(
  'workspaces',
  {
    id: text('id').primaryKey().$defaultFn(() => uuidv4()),
    name: text('name').notNull(),
    description: text('description'),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    gitUrl: text('git_url'),
    gitBranch: text('git_branch'),
    status: text('status').notNull().default('active'),
    isPinned: integer('is_pinned', { mode: 'boolean' }).notNull().default(false),
    projectSummary: text('project_summary', { mode: 'json' }),
    lastOpenedAt: integer('last_opened_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    ownerIdx: index('workspaces_owner_idx').on(t.ownerId),
    nameIdx: index('workspaces_name_idx').on(t.name),
  }),
);

// ── Workspace Members ─────────────────────────────────────────────────────────

export const workspaceMembers = sqliteTable(
  'workspace_members',
  {
    id: text('id').primaryKey().$defaultFn(() => uuidv4()),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('developer'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    uniqueIdx: uniqueIndex('workspace_members_unique').on(t.workspaceId, t.userId),
  }),
);

// ── Chats ─────────────────────────────────────────────────────────────────────

export const chats = sqliteTable(
  'chats',
  {
    id: text('id').primaryKey().$defaultFn(() => uuidv4()),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    // watsonx Orchestrate server-side thread id (X-IBM-THREAD-ID) — keeps the
    // platform-side conversation continuous across turns for this chat.
    orchestrateThreadId: text('orchestrate_thread_id'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    workspaceIdx: index('chats_workspace_idx').on(t.workspaceId),
    userIdx: index('chats_user_idx').on(t.userId),
  }),
);

// ── Messages ──────────────────────────────────────────────────────────────────

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey().$defaultFn(() => uuidv4()),
    chatId: text('chat_id')
      .notNull()
      .references(() => chats.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    toolCalls: text('tool_calls', { mode: 'json' }),
    toolResults: text('tool_results', { mode: 'json' }),
    reasoning: text('reasoning'),
    tokens: integer('tokens'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    chatIdx: index('messages_chat_idx').on(t.chatId),
    createdAtIdx: index('messages_created_at_idx').on(t.chatId, t.createdAt),
  }),
);

// ── Tasks ─────────────────────────────────────────────────────────────────────

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey().$defaultFn(() => uuidv4()),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    chatId: text('chat_id').references(() => chats.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    description: text('description'),
    status: text('status').notNull().default('queued'),
    progress: integer('progress').default(0),
    startedAt: integer('started_at', { mode: 'timestamp' }),
    completedAt: integer('completed_at', { mode: 'timestamp' }),
    error: text('error'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    workspaceIdx: index('tasks_workspace_idx').on(t.workspaceId),
    statusIdx: index('tasks_status_idx').on(t.status),
  }),
);

// ── Memories ──────────────────────────────────────────────────────────────────

export const memories = sqliteTable(
  'memories',
  {
    id: text('id').primaryKey().$defaultFn(() => uuidv4()),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    content: text('content').notNull(),
    metadata: text('metadata', { mode: 'json' }),
    embedding: text('embedding', { mode: 'json' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    workspaceIdx: index('memories_workspace_idx').on(t.workspaceId),
    typeIdx: index('memories_type_idx').on(t.workspaceId, t.type),
  }),
);

// ── Settings ──────────────────────────────────────────────────────────────────

export const userSettings = sqliteTable('user_settings', {
  userId: text('user_id')
    .primaryKey()
    .references(() => users.id, { onDelete: 'cascade' }),
  theme: text('theme').notNull().default('dark'),
  fontSize: integer('font_size').notNull().default(14),
  tabSize: integer('tab_size').notNull().default(2),
  autoSave: integer('auto_save', { mode: 'boolean' }).notNull().default(true),
  modelId: text('model_id'),
  temperature: real('temperature').notNull().default(0.2),
  maxTokens: integer('max_tokens').notNull().default(4096),
  githubToken: text('github_token'),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
});

// ── Audit Logs ────────────────────────────────────────────────────────────────

export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey().$defaultFn(() => uuidv4()),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    workspaceId: text('workspace_id').references(() => workspaces.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    resource: text('resource'),
    resourceId: text('resource_id'),
    details: text('details', { mode: 'json' }),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    userIdx: index('audit_logs_user_idx').on(t.userId),
    actionIdx: index('audit_logs_action_idx').on(t.action),
    createdAtIdx: index('audit_logs_created_at_idx').on(t.createdAt),
  }),
);

// ── Terminal Sessions ─────────────────────────────────────────────────────────

export const terminalSessions = sqliteTable(
  'terminal_sessions',
  {
    id: text('id').primaryKey().$defaultFn(() => uuidv4()),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull().default('Terminal'),
    status: text('status').notNull().default('idle'),
    pid: integer('pid'),
    cwd: text('cwd').notNull(),
    output: text('output', { mode: 'json' }).default('[]'),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  },
  (t) => ({
    workspaceIdx: index('terminal_sessions_workspace_idx').on(t.workspaceId),
  }),
);
