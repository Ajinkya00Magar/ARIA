// ─────────────────────────────────────────────────────────────────────────────
// File-based Storage — replaces the SQLite database entirely.
//
// Layout:
//   {userData}/workspaces.json      → registry of opened folders (recents)
//   {userData}/settings.json        → user settings
//   {folder}/.aria/chats.json       → chat history, saved inside each project
//
// {userData} = ELECTRON_USER_DATA (set by the Electron main process) or
// ~/.aria-ide when running standalone.
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'fs/promises';
import path from 'path';
import os from 'os';

export const dataDir = process.env.ELECTRON_USER_DATA || path.join(os.homedir(), '.aria-ide');

// ── Generic atomic JSON helpers ───────────────────────────────────────────────

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

// Serialize writes per file so concurrent requests can't interleave
const writeLocks = new Map<string, Promise<void>>();
async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = writeLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => (release = r));
  writeLocks.set(key, prev.then(() => next));
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (writeLocks.get(key) === next) writeLocks.delete(key);
  }
}

// ── Workspace registry (recently opened folders) ─────────────────────────────

export interface WorkspaceRecord {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  path: string;
  gitUrl?: string;
  gitBranch?: string;
  status: string;
  isPinned: boolean;
  projectSummary?: unknown;
  lastOpenedAt?: string;
  createdAt: string;
  updatedAt: string;
}

const workspacesFile = () => path.join(dataDir, 'workspaces.json');

export async function listWorkspaceRecords(): Promise<WorkspaceRecord[]> {
  return readJson<WorkspaceRecord[]>(workspacesFile(), []);
}

export async function saveWorkspaceRecords(records: WorkspaceRecord[]): Promise<void> {
  await withLock(workspacesFile(), () => writeJson(workspacesFile(), records));
}

export async function updateWorkspaceRecords(
  mutate: (records: WorkspaceRecord[]) => WorkspaceRecord[] | void,
): Promise<WorkspaceRecord[]> {
  return withLock(workspacesFile(), async () => {
    const records = await readJson<WorkspaceRecord[]>(workspacesFile(), []);
    const result = mutate(records) ?? records;
    await writeJson(workspacesFile(), result);
    return result;
  });
}

// ── Settings ──────────────────────────────────────────────────────────────────

export interface UserSettings {
  userId: string;
  theme: string;
  fontSize: number;
  tabSize: number;
  autoSave: boolean;
  modelId?: string;
  temperature: number;
  maxTokens: number;
  githubToken?: string;
  watsonxApiKey?: string;
  hasCompletedOnboarding: boolean;
  updatedAt: string;
}

const DEFAULT_SETTINGS: UserSettings = {
  userId: 'local-dev-user',
  theme: 'dark',
  fontSize: 14,
  tabSize: 2,
  autoSave: true,
  temperature: 0.2,
  maxTokens: 4096,
  hasCompletedOnboarding: false,
  updatedAt: new Date(0).toISOString(),
};

const settingsFile = () => path.join(dataDir, 'settings.json');

export async function getSettings(): Promise<UserSettings> {
  const stored = await readJson<Partial<UserSettings>>(settingsFile(), {});
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function updateSettings(updates: Partial<UserSettings>): Promise<UserSettings> {
  return withLock(settingsFile(), async () => {
    const stored = await readJson<Partial<UserSettings>>(settingsFile(), {});
    const merged: UserSettings = {
      ...DEFAULT_SETTINGS,
      ...stored,
      ...updates,
      userId: 'local-dev-user',
      updatedAt: new Date().toISOString(),
    };
    await writeJson(settingsFile(), merged);
    return merged;
  });
}

// ── Chat history — stored inside each project folder (.aria/chats.json) ──────

export interface MessageRecord {
  id: string;
  chatId: string;
  role: string;
  content: string;
  toolCalls?: unknown;
  toolResults?: unknown;
  createdAt: string;
}

export interface ChatRecord {
  id: string;
  workspaceId: string;
  userId: string;
  title: string;
  orchestrateThreadId?: string;
  createdAt: string;
  updatedAt: string;
  messages: MessageRecord[];
}

const chatsFile = (workspacePath: string) => path.join(workspacePath, '.aria', 'chats.json');

async function ensureAriaDir(workspacePath: string): Promise<void> {
  const ariaDir = path.join(workspacePath, '.aria');
  await fs.mkdir(ariaDir, { recursive: true });
  // Self-ignoring folder: keeps chat history out of the user's git repo
  const gi = path.join(ariaDir, '.gitignore');
  try {
    await fs.access(gi);
  } catch {
    await fs.writeFile(gi, '*\n', 'utf8');
  }
}

export async function listChats(workspacePath: string): Promise<ChatRecord[]> {
  return readJson<ChatRecord[]>(chatsFile(workspacePath), []);
}

export async function getChat(workspacePath: string, chatId: string): Promise<ChatRecord | undefined> {
  const chats = await listChats(workspacePath);
  return chats.find((c) => c.id === chatId);
}

export async function updateChats(
  workspacePath: string,
  mutate: (chats: ChatRecord[]) => ChatRecord[] | void,
): Promise<ChatRecord[]> {
  const file = chatsFile(workspacePath);
  return withLock(file, async () => {
    await ensureAriaDir(workspacePath);
    const chats = await readJson<ChatRecord[]>(file, []);
    const result = mutate(chats) ?? chats;
    await writeJson(file, result);
    return result;
  });
}
