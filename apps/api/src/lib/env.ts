// ─────────────────────────────────────────────────────────────────────────────
// Environment Variable Validation (Fail fast at startup)
// ─────────────────────────────────────────────────────────────────────────────

import fs from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

function loadEnvironmentFile(): void {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '.env'),
    path.resolve(process.cwd(), '..', '..', '.env'),
    path.resolve(__dirname, '..', '..', '..', '.env'),
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
  PORT: z.coerce.number().default(3001),

  // Database
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // IBM watsonx
  IBM_CLOUD_API_KEY: z.string().min(1, 'IBM_CLOUD_API_KEY is required'),
  IBM_PROJECT_ID: z.string().min(1, 'IBM_PROJECT_ID is required'),
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

  // JWT
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),

  // OAuth (optional — app functions with local auth if not set)
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  // App
  NEXTAUTH_URL: z.string().url().default('http://localhost:3000'),
  API_URL: z.string().url().default('http://localhost:3001'),
  ALLOWED_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((s) => s.split(',').map((o) => o.trim())),
  WORKSPACE_ROOT: z.string().default(process.platform === 'win32' ? 'C:/ibm-agent-workspaces' : '/tmp/ibm-agent-workspaces'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),

  // Redis (optional)
  REDIS_URL: z.string().optional(),
});

function parseEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Invalid environment variables:');
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  return result.data;
}

export const env = parseEnv();
export type Env = typeof env;
