import { supabase } from './supabase';

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

export async function listWorkspaceRecords(userId: string): Promise<WorkspaceRecord[]> {
  const { data, error } = await supabase
    .from('workspaces')
    .select('*')
    .eq('owner_id', userId)
    .order('last_opened_at', { ascending: false });

  if (error) {
    console.error('Error fetching workspaces:', error);
    return [];
  }

  return data.map(mapWorkspaceRecord);
}

export async function saveWorkspaceRecords(records: WorkspaceRecord[]): Promise<void> {
  // Unused in Supabase mode (we insert individually)
}

export async function updateWorkspaceRecords(
  userId: string,
  mutate: (records: WorkspaceRecord[]) => WorkspaceRecord[] | void,
): Promise<WorkspaceRecord[]> {
  // Fallback for legacy code calling this wrapper
  const records = await listWorkspaceRecords(userId);
  const result = mutate(records) ?? records;
  return result;
}

export async function insertWorkspaceRecord(record: WorkspaceRecord): Promise<void> {
  const { error } = await supabase.from('workspaces').insert({
    id: record.id,
    name: record.name,
    description: record.description,
    owner_id: record.ownerId,
    path: record.path,
    git_url: record.gitUrl,
    git_branch: record.gitBranch,
    status: record.status,
    is_pinned: record.isPinned,
    project_summary: record.projectSummary,
    last_opened_at: record.lastOpenedAt,
    created_at: record.createdAt,
    updated_at: record.updatedAt
  });
  if (error) console.error('Error inserting workspace:', error);
}

export async function patchWorkspaceRecord(id: string, updates: Partial<WorkspaceRecord>): Promise<void> {
  const { error } = await supabase.from('workspaces').update({
    name: updates.name,
    description: updates.description,
    path: updates.path,
    git_url: updates.gitUrl,
    git_branch: updates.gitBranch,
    status: updates.status,
    is_pinned: updates.isPinned,
    project_summary: updates.projectSummary,
    last_opened_at: updates.lastOpenedAt,
    updated_at: updates.updatedAt
  }).eq('id', id);
  if (error) console.error('Error updating workspace:', error);
}

export async function deleteWorkspaceRecord(id: string): Promise<void> {
  const { error } = await supabase.from('workspaces').delete().eq('id', id);
  if (error) console.error('Error deleting workspace:', error);
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
  userId: '',
  theme: 'dark',
  fontSize: 14,
  tabSize: 2,
  autoSave: true,
  temperature: 0.2,
  maxTokens: 4096,
  hasCompletedOnboarding: false,
  updatedAt: new Date(0).toISOString(),
};

export async function getSettings(userId: string): Promise<UserSettings> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) {
    return { ...DEFAULT_SETTINGS, userId };
  }

  return mapSettingsRecord(data);
}

export async function updateSettings(userId: string, updates: Partial<UserSettings>): Promise<UserSettings> {
  const current = await getSettings(userId);
  const merged = { ...current, ...updates, updatedAt: new Date().toISOString() };
  
  const { error } = await supabase.from('user_settings').upsert({
    user_id: userId,
    theme: merged.theme,
    font_size: merged.fontSize,
    tab_size: merged.tabSize,
    auto_save: merged.autoSave,
    model_id: merged.modelId,
    temperature: merged.temperature,
    max_tokens: merged.maxTokens,
    github_token: merged.githubToken,
    watsonx_api_key: merged.watsonxApiKey,
    has_completed_onboarding: merged.hasCompletedOnboarding,
    updated_at: merged.updatedAt
  });

  if (error) console.error('Error updating settings:', error);
  return merged;
}

// ── Chat history ─────────────────────────────────────────────────────────────

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

export async function listChats(workspaceId: string): Promise<ChatRecord[]> {
  const { data, error } = await supabase
    .from('chats')
    .select(`
      *,
      chat_messages (*)
    `)
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching chats:', error);
    return [];
  }

  return data.map(mapChatRecord);
}

export async function getChat(workspaceId: string, chatId: string): Promise<ChatRecord | undefined> {
  const { data, error } = await supabase
    .from('chats')
    .select(`*, chat_messages (*)`)
    .eq('id', chatId)
    .single();

  if (error || !data) return undefined;
  return mapChatRecord(data);
}

export async function updateChats(
  workspaceId: string,
  mutate: (chats: ChatRecord[]) => ChatRecord[] | void,
): Promise<ChatRecord[]> {
  // Note: Due to limitations of replacing this entirely, we should just use individual inserts/updates from the chat service directly.
  return []; 
}

// Helpers
function mapWorkspaceRecord(row: any): WorkspaceRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    ownerId: row.owner_id,
    path: row.path,
    gitUrl: row.git_url,
    gitBranch: row.git_branch,
    status: row.status,
    isPinned: row.is_pinned,
    projectSummary: row.project_summary,
    lastOpenedAt: row.last_opened_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapSettingsRecord(row: any): UserSettings {
  return {
    userId: row.user_id,
    theme: row.theme,
    fontSize: row.font_size,
    tabSize: row.tab_size,
    autoSave: row.auto_save,
    modelId: row.model_id,
    temperature: row.temperature,
    maxTokens: row.max_tokens,
    githubToken: row.github_token,
    watsonxApiKey: row.watsonx_api_key,
    hasCompletedOnboarding: row.has_completed_onboarding,
    updatedAt: row.updated_at
  };
}

function mapChatRecord(row: any): ChatRecord {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    userId: row.user_id,
    title: row.title,
    orchestrateThreadId: row.orchestrate_thread_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    messages: (row.chat_messages || []).map((m: any) => ({
      id: m.id,
      chatId: m.chat_id,
      role: m.role,
      content: m.content,
      toolCalls: m.tool_calls,
      toolResults: m.tool_results,
      createdAt: m.created_at
    })).sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  };
}
