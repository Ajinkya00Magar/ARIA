// ─────────────────────────────────────────────────────────────────────────────
// Environment Variable Validation (Fail fast at startup)
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

function loadEnvironmentFile(): void {
  const candidates = [
    // Packaged desktop app: a user-editable .env in the Electron userData dir
    // takes priority so credentials can be supplied without a rebuild.
    ...(process.env.ELECTRON_USER_DATA
      ? [path.resolve(process.env.ELECTRON_USER_DATA, '.env')]
      : []),
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '.env'),
    path.resolve(process.cwd(), '..', '..', '.env'),
    path.resolve(__dirname, '..', '..', '..', '.env'),
    // Packaged desktop app: .env bundled next to the compiled API
    // (bundle/api/.env), resolved from dist/lib → ../../.env
    path.resolve(__dirname, '..', '..', '.env'),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      loadEnv({ path: candidate });
      return;
    }
  }

  loadEnv();
}

loadEnvironmentFile();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(process.env.NODE_ENV === 'production' ? 3001 : 3002),

  // IBM watsonx — optional so the app always boots. If absent, the agent
  // degrades gracefully (chat requiring watsonx returns a helpful error) but
  // the IDE, file access, git, and terminal all still work.
  IBM_CLOUD_API_KEY: z.string().default(''),
  IBM_PROJECT_ID: z.string().default(''),
  IBM_WATSONX_URL: z.string().url().default('https://us-south.ml.cloud.ibm.com'),
  IBM_REGION: z.string().default('us-south'),
  IBM_MODEL_ID: z.string().default('ibm/granite-34b-code-instruct'),

  // IBM Orchestrate Agent — the primary backend when IBM_ORCHESTRATE_URL is
  // set. Set USE_ORCHESTRATE=false to fall back to the local watsonx
  // CodingAgent (e.g. for debugging tool execution without the platform).
  USE_ORCHESTRATE: z
    .string()
    .optional()
    .transform((s) => s === undefined || !(s === 'false' || s === '0')),
  IBM_ORCHESTRATE_URL: z.string().url().optional(),
  IBM_ORCHESTRATE_API_KEY: z.string().optional(),
  IBM_ORCHESTRATE_BEARER_TOKEN: z.string().optional(),

  // IBM Object Storage (optional but validated if present)
  IBM_OBJECT_STORAGE_ENDPOINT: z.string().optional(),
  IBM_OBJECT_STORAGE_API_KEY: z.string().optional(),
  IBM_BUCKET: z.string().optional(),

  // IBM Secrets Manager (optional)
  IBM_SECRET_MANAGER_URL: z.string().url().optional(),

  // IBM Cloudant (optional)
  IBM_CLOUDANT_URL: z.string().url().optional(),
  IBM_CLOUDANT_API_KEY: z.string().optional(),

  // JWT — legacy, only used for cookie signing; harmless default for local app
  JWT_SECRET: z.string().default('aria-local-desktop-cookie-signing-key'),
  JWT_REFRESH_SECRET: z.string().default('aria-local-desktop-refresh-key-0000'),

  // OAuth (optional — app functions with local auth if not set)
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // App
  NEXTAUTH_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default(process.env.NODE_ENV === 'production' ? 'http://localhost:3001' : 'http://localhost:3002'),
  ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((s) => s.split(',').map((o) => o.trim())),
  WORKSPACE_ROOT: z.string().default(process.platform === 'win32' ? 'C:/ibm-agent-workspaces' : '/tmp/ibm-agent-workspaces'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Redis (optional)
  REDIS_URL: z.string().optional(),

  // Supabase (optional)
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_ANON_KEY: z.string().optional(),
  
  // Cloud Proxy
  IS_CLOUD_PROXY: z.string().optional(),
  CLOUD_PROXY_URL: z.string().url().optional(),
});

function parseEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    // Never kill the app over env issues — everything has a default or is
    // optional. Log the problem and fall back to a fully-defaulted config so
    // the packaged desktop app always boots.
    console.error('⚠️  Environment validation warnings (using defaults):');
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    return envSchema.parse({});
  }
  return result.data;
}

export const env = parseEnv();
export type Env = typeof env;
