// ─────────────────────────────────────────────────────────────────────────────
// Shared Constants
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_MODEL_ID = 'ibm/granite-34b-code-instruct';
export const DEFAULT_TEMPERATURE = 0.2;
export const DEFAULT_MAX_TOKENS = 4096;

export const IBM_WATSONX_BASE_URL = 'https://us-south.ml.cloud.ibm.com';
export const IBM_IAM_TOKEN_URL = 'https://iam.cloud.ibm.com/identity/token';

export const MAX_FILE_SIZE_MB = 10;
export const MAX_CONTEXT_FILES = 20;
export const WORKSPACE_ROOT = process.env.WORKSPACE_ROOT ?? '/workspaces';

export const DANGEROUS_COMMANDS = [
  'rm -rf',
  'sudo rm',
  'format',
  'mkfs',
  'fdisk',
  'dd if=',
  ':(){',
  '>/dev/sda',
  'chmod 777 /',
  'chown -R',
  'passwd',
  'sudo su',
  'shutdown',
  'reboot',
  'halt',
  'pkill',
  'kill -9',
  'iptables -F',
  'iptables --flush',
];

export const ALLOWED_SHELLS = ['bash', 'sh', 'zsh', 'fish'];

export const SUPPORTED_LANGUAGES = [
  'javascript',
  'typescript',
  'python',
  'rust',
  'go',
  'java',
  'csharp',
  'cpp',
  'c',
  'ruby',
  'php',
  'swift',
  'kotlin',
];

export const SAFE_PACKAGES_INSTALLERS = ['npm', 'pnpm', 'yarn', 'pip', 'pip3', 'cargo', 'go', 'gradle', 'mvn'];

export const JWT_ACCESS_EXPIRES = '15m';
export const JWT_REFRESH_EXPIRES = '7d';

export const MAX_RETRIES = 3;
export const RETRY_DELAY_MS = 1000;

export const RATE_LIMITS = {
  auth: { windowMs: 15 * 60 * 1000, max: 10 },
  api: { windowMs: 1 * 60 * 1000, max: 60 },
  agent: { windowMs: 1 * 60 * 1000, max: 10 },
};

export const PERMISSION_TIMEOUT_MS = 30000;

export const EMBEDDING_DIMENSIONS = 384;
export const MAX_EMBEDDING_BATCH = 100;

export const EVENT_TYPES = {
  WORKSPACE_CREATED: 'workspace.created',
  WORKSPACE_DELETED: 'workspace.deleted',
  AGENT_TASK_COMPLETED: 'agent.task.completed',
  AGENT_TASK_FAILED: 'agent.task.failed',
  USER_REGISTERED: 'user.registered',
} as const;
