// ─────────────────────────────────────────────────────────────────────────────
// IBM Coding Agent — Shared Type Definitions
// ─────────────────────────────────────────────────────────────────────────────

// ── User & Auth ───────────────────────────────────────────────────────────────

export type UserRole = 'admin' | 'developer' | 'viewer';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: UserRole;
  provider: 'local' | 'github' | 'google';
  createdAt: Date;
  updatedAt: Date;
}

export interface Session {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export interface AuthTokenPayload {
  sub: string;
  email: string;
  role: UserRole;
  iat: number;
  exp: number;
}

// ── Workspace ─────────────────────────────────────────────────────────────────

export type WorkspaceStatus = 'active' | 'idle' | 'building' | 'error';

export interface Workspace {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  path: string;
  gitUrl?: string;
  gitBranch?: string;
  status: WorkspaceStatus;
  isPinned: boolean;
  lastOpenedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface WorkspaceFile {
  path: string;
  name: string;
  type: 'file' | 'directory';
  size?: number;
  language?: string;
  lastModified?: Date;
  children?: WorkspaceFile[];
}

// ── Chat & Messages ───────────────────────────────────────────────────────────

export type MessageRole = 'user' | 'assistant' | 'system' | 'tool';

export interface ChatMessage {
  id: string;
  chatId: string;
  role: MessageRole;
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
  reasoning?: string;
  tokens?: number;
  createdAt: Date;
}

export interface Chat {
  id: string;
  workspaceId: string;
  userId: string;
  title: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

// ── Agent & Tools ─────────────────────────────────────────────────────────────

export type AgentStatus = 'idle' | 'thinking' | 'executing' | 'waiting' | 'done' | 'error';

export type ToolName =
  | 'read_file'
  | 'write_file'
  | 'delete_file'
  | 'rename_file'
  | 'move_file'
  | 'list_files'
  | 'create_folder'
  | 'search_code'
  | 'replace_code'
  | 'run_terminal'
  | 'run_tests'
  | 'install_packages'
  | 'git_status'
  | 'git_commit'
  | 'git_branch'
  | 'git_checkout'
  | 'git_diff'
  | 'git_push'
  | 'git_pull'
  | 'git_log'
  | 'lint_project'
  | 'build_project'
  | 'start_dev_server'
  | 'stop_dev_server'
  | 'read_directory';

export interface ToolCall {
  id: string;
  name: ToolName;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  toolCallId: string;
  name: ToolName;
  output: string;
  error?: string;
  duration?: number;
}

export interface ToolDefinition {
  name: ToolName;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameterDefinition>;
    required?: string[];
  };
}

export interface ToolParameterDefinition {
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  description: string;
  enum?: string[];
  items?: ToolParameterDefinition;
  properties?: Record<string, ToolParameterDefinition>;
}

// ── Agent Streaming Events ────────────────────────────────────────────────────

export type AgentEventType =
  | 'thinking'
  | 'tool_start'
  | 'tool_end'
  | 'tool_error'
  | 'content_delta'
  | 'content_done'
  | 'agent_done'
  | 'agent_error'
  | 'permission_request'
  | 'status_update'
  | 'chat_info'
  | 'tool_call_request';

export interface AgentEvent {
  type: AgentEventType;
  id?: string;
  data: AgentEventData;
  timestamp: Date;
}

export type AgentEventData =
  | ThinkingEvent
  | ToolStartEvent
  | ToolEndEvent
  | ToolErrorEvent
  | ContentDeltaEvent
  | ContentDoneEvent
  | AgentDoneEvent
  | AgentErrorEvent
  | PermissionRequestEvent
  | StatusUpdateEvent
  | ChatInfoEvent
  | ToolCallRequestEvent;

export interface ThinkingEvent {
  text: string;
}

export interface ToolStartEvent {
  toolCallId: string;
  toolName: ToolName;
  arguments: Record<string, unknown>;
}

export interface ToolEndEvent {
  toolCallId: string;
  toolName: ToolName;
  output: string;
  duration: number;
}

export interface ToolErrorEvent {
  toolCallId: string;
  toolName: ToolName;
  error: string;
}

export interface ContentDeltaEvent {
  delta: string;
}

export interface ContentDoneEvent {
  content: string;
  tokens?: number;
}

export interface AgentDoneEvent {
  summary: string;
  totalTokens?: number;
}

export interface AgentErrorEvent {
  error: string;
  code?: string;
}

export interface PermissionRequestEvent {
  requestId: string;
  action: string;
  description: string;
  details: Record<string, unknown>;
  timeout: number;
}

export interface StatusUpdateEvent {
  status: AgentStatus;
  message?: string;
}

export interface ChatInfoEvent {
  chatId: string;
}

export interface ToolCallRequestEvent {
  toolCalls: ToolCall[];
}

// ── Task ──────────────────────────────────────────────────────────────────────

export type TaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface Task {
  id: string;
  workspaceId: string;
  userId: string;
  chatId?: string;
  name: string;
  description?: string;
  status: TaskStatus;
  progress?: number;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ── Memory ────────────────────────────────────────────────────────────────────

export type MemoryType = 'conversation' | 'workspace' | 'repository' | 'task' | 'longterm';

export interface Memory {
  id: string;
  workspaceId: string;
  userId: string;
  type: MemoryType;
  content: string;
  metadata?: Record<string, unknown>;
  embedding?: number[];
  createdAt: Date;
}

// ── Repository ────────────────────────────────────────────────────────────────

export interface RepositorySymbol {
  name: string;
  kind: 'class' | 'function' | 'interface' | 'type' | 'variable' | 'route' | 'component';
  filePath: string;
  line: number;
  description?: string;
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}

export interface DependencyNode {
  id: string;
  label: string;
  filePath: string;
  type: 'module' | 'package' | 'class' | 'function';
}

export interface DependencyEdge {
  from: string;
  to: string;
  type: 'import' | 'export' | 'call' | 'extends' | 'implements';
}

export interface ProjectSummary {
  name: string;
  description?: string;
  language: string;
  framework?: string;
  entryPoints: string[];
  totalFiles: number;
  totalLines: number;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
  symbols: RepositorySymbol[];
  structure: string;
  createdAt: Date;
}

// ── Git ───────────────────────────────────────────────────────────────────────

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  staged: GitFileChange[];
  unstaged: GitFileChange[];
  untracked: string[];
  conflicted: string[];
}

export interface GitFileChange {
  path: string;
  status: 'M' | 'A' | 'D' | 'R' | 'C' | 'U';
  oldPath?: string;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  email: string;
  date: Date;
}

export interface GitBranch {
  name: string;
  isCurrent: boolean;
  isRemote: boolean;
  lastCommit?: string;
}

// ── Terminal ──────────────────────────────────────────────────────────────────

export type TerminalStatus = 'idle' | 'running' | 'exited';

export interface TerminalSession {
  id: string;
  workspaceId: string;
  name: string;
  status: TerminalStatus;
  pid?: number;
  cwd: string;
  createdAt: Date;
}

export interface TerminalOutput {
  sessionId: string;
  data: string;
  type: 'stdout' | 'stderr' | 'system';
  timestamp: Date;
}

// ── Settings ──────────────────────────────────────────────────────────────────

export interface UserSettings {
  userId: string;
  theme: 'dark' | 'light' | 'system';
  fontSize: number;
  tabSize: number;
  autoSave: boolean;
  modelId?: string;
  temperature: number;
  maxTokens: number;
  githubToken?: string;
  ibmApiKey?: string;
  updatedAt: Date;
}

// ── API Responses ─────────────────────────────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ApiMeta;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface ApiMeta {
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// ── Watsonx ───────────────────────────────────────────────────────────────────

export interface WatsonxConfig {
  apiKey: string;
  projectId: string;
  baseUrl: string;
  region: string;
  modelId: string;
  parameters?: WatsonxParameters;
}

export interface WatsonxParameters {
  temperature?: number;
  maxNewTokens?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  repetitionPenalty?: number;
}

export interface WatsonxMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | WatsonxContentPart[];
  toolCallId?: string;
  toolCalls?: WatsonxToolCall[];
  name?: string;
}

export interface WatsonxContentPart {
  type: 'text' | 'tool_result';
  text?: string;
}

export interface WatsonxToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}
