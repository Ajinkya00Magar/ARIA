# ARIA (IBM Coding Agent)

> A production-ready AI Coding Agent powered by IBM watsonx.ai and IBM Granite Code.  
> An open alternative to Cursor Agent, Claude Code, and Devin.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![IBM watsonx.ai](https://img.shields.io/badge/Powered_by-IBM_watsonx.ai-0f62fe)](https://www.ibm.com/products/watsonx-ai)

---

## Overview

IBM Coding Agent is a full-featured AI coding assistant that operates like a real engineer. It:

- **Reads and understands** entire repositories (files, symbols, dependencies)
- **Plans** complex multi-step tasks autonomously
- **Writes, edits, renames, and deletes** files inside your workspace
- **Runs terminal commands** and reads output / errors
- **Fixes bugs** and re-runs tests automatically
- **Manages git** — status, diff, commit, push, pull, branch
- **Asks your permission** before deleting files or force-pushing
- **Streams** every step to the UI in real-time via SSE

All powered by **IBM Granite Code** on **IBM watsonx.ai**.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, TypeScript, TailwindCSS, Monaco Editor, Framer Motion, Zustand |
| Backend | Node.js, Express, TypeScript, Drizzle ORM |
| AI | IBM watsonx.ai — Granite Code (34B / 20B / 8B) |
| Database | PostgreSQL 16 + pgvector |
| Auth | JWT + refresh tokens, GitHub OAuth, Google OAuth |

---

## Project Structure

```
ibm-coding-agent/
├── packages/
│   ├── types/        # Shared TypeScript types
│   ├── shared/       # Utils, validators, error classes, logger
│   ├── ai/           # IBM watsonx.ai client + agent loop + tool definitions
│   └── tools/        # File system, terminal, git, search, project analyzer
├── apps/
│   ├── api/          # Express REST API  (runs on port 3001)
│   └── web/          # Next.js frontend  (runs on port 3000)
├── docs/             # IBM Cloud setup guide, architecture, developer guide
└── scripts/          # setup.sh helper
```

---

## Local Development

### Prerequisites

- **Node.js 20+** — [nodejs.org](https://nodejs.org)
- **npm 10+** — comes with Node 20
- **PostgreSQL 16+** — [postgresql.org/download](https://www.postgresql.org/download/)
- **IBM Cloud account** — [cloud.ibm.com](https://cloud.ibm.com) (free tier works)

### 1 — Clone and install

```bash
git clone https://github.com/your-org/ibm-coding-agent.git
cd ibm-coding-agent
npm install
```

### 2 — Set up the database

```bash
# Create the database (assumes your local Postgres user is "postgres")
createdb ibm_coding_agent

# Run the schema migration
psql ibm_coding_agent -f apps/api/migrations/001_initial.sql
```

> **Windows:** use `psql -U postgres ibm_coding_agent -f apps/api/migrations/001_initial.sql`  
> **macOS with Homebrew:** run `brew services start postgresql@16` first

### 3 — Configure environment variables

```bash
cp .env.example .env
```

Then open `.env` and fill in at minimum these four values:

| Variable | Where to get it |
|----------|----------------|
| `IBM_CLOUD_API_KEY` | [cloud.ibm.com → Manage → IAM → API Keys → Create](https://cloud.ibm.com/iam/apikeys) |
| `IBM_PROJECT_ID` | [dataplatform.ibm.com](https://dataplatform.ibm.com) → your project → Settings → Project ID |
| `JWT_SECRET` | Run: `node -e "console.log(require('crypto').randomBytes(64).toString('base64'))"` |
| `JWT_REFRESH_SECRET` | Run the same command again — use a **different** value |

All other variables have working defaults for local development.  
See **[docs/IBM_CLOUD_SETUP.md](docs/IBM_CLOUD_SETUP.md)** for the full step-by-step guide.

### 4 — Seed the database (optional)

```bash
npm run db:seed
```

This creates an admin account: `admin@ibm-agent.local` / `Admin@123456!`  
Change the password after first login.

### 5 — Start development servers

```bash
npm run dev
```

This starts both apps in parallel via Turborepo:

| App | URL |
|-----|-----|
| Frontend (Next.js) | http://localhost:3000 |
| API (Express) | http://localhost:3001 |
| API health check | http://localhost:3001/health |

---

## IBM Cloud Setup

See **[docs/IBM_CLOUD_SETUP.md](docs/IBM_CLOUD_SETUP.md)** for the full guide. The short version:

1. **IBM Cloud API Key** — `cloud.ibm.com → Manage → Access (IAM) → API Keys → Create`
2. **Watson Machine Learning** — `cloud.ibm.com → Catalog → Watson Machine Learning → Create (Lite = free)`
3. **watsonx Project** — `dataplatform.ibm.com → New project → Settings → copy Project ID`
4. **Granite Code model** — set `IBM_MODEL_ID=ibm/granite-34b-code-instruct` in `.env`

---

## Deploying to Vercel

The project has two apps. You will deploy them as **two separate Vercel projects**.

### Deploy the API

The Express API runs as a Vercel serverless function.

```bash
cd apps/api
npx vercel
```

When Vercel prompts you:
- **Root directory:** `apps/api`
- **Framework:** Other
- **Build command:** `npm run build`
- **Output directory:** `dist`

After the first deploy, add these **Environment Variables** in the Vercel dashboard (`Settings → Environment Variables`):

| Variable | Value |
|----------|-------|
| `IBM_CLOUD_API_KEY` | your IBM Cloud API key |
| `IBM_PROJECT_ID` | your watsonx project ID |
| `IBM_WATSONX_URL` | `https://us-south.ml.cloud.ibm.com` |
| `IBM_MODEL_ID` | `ibm/granite-34b-code-instruct` |
| `DATABASE_URL` | your PostgreSQL connection string |
| `JWT_SECRET` | at least 32 random characters |
| `JWT_REFRESH_SECRET` | different 32 random characters |
| `ALLOWED_ORIGINS` | your web app's Vercel URL (e.g. `https://ibm-agent-web.vercel.app`) |
| `WORKSPACE_ROOT` | `/tmp/ibm-agent-workspaces` |
| `NODE_ENV` | `production` |

> **Note:** Vercel serverless functions have a `/tmp` directory available. Workspaces created by users will live there during the function invocation. For persistent workspaces, configure IBM Cloud Object Storage.

Copy the deployed API URL (e.g. `https://ibm-agent-api.vercel.app`).

---

### Deploy the Frontend

```bash
cd apps/web
npx vercel
```

When Vercel prompts you:
- **Root directory:** `apps/web`
- **Framework:** Next.js

Add these **Environment Variables** in the Vercel dashboard:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | your deployed API URL from the previous step |
| `NEXTAUTH_URL` | your web app's Vercel URL |
| `NEXTAUTH_SECRET` | at least 32 random characters |

Redeploy after adding variables:

```bash
npx vercel --prod
```

---

### Post-deploy checklist

- [ ] Run migrations against your production database: `psql $DATABASE_URL -f apps/api/migrations/001_initial.sql`
- [ ] Update `ALLOWED_ORIGINS` on the API to match your web URL
- [ ] Update OAuth callback URLs (GitHub/Google) to point at your production API URL
- [ ] Verify `/health` returns `{"status":"healthy"}` on the API

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start API + frontend in dev mode |
| `npm run build` | Build all packages and apps |
| `npm run typecheck` | TypeScript type-check everything |
| `npm run lint` | Lint all apps |
| `npm run db:migrate` | Run SQL migrations |
| `npm run db:seed` | Seed the database with an admin user |
| `npm run format` | Format all files with Prettier |
| `npm run clean` | Remove all build artifacts |

---

## Agent Tools

The AI agent has 27 built-in tools:

| Category | Tools |
|----------|-------|
| File System | `read_file` `write_file` `delete_file` `rename_file` `move_file` `list_files` `create_folder` `read_directory` |
| Code | `search_code` `replace_code` |
| Terminal | `run_terminal` `run_tests` `install_packages` `lint_project` `build_project` `start_dev_server` `stop_dev_server` |
| Git | `git_status` `git_commit` `git_branch` `git_checkout` `git_diff` `git_push` `git_pull` `git_log` |

Destructive operations (`delete_file`, `git_push`) require explicit confirmation via a dialog before the agent proceeds.

---

## Security

- All file ops are sandboxed to the workspace directory — path traversal is blocked
- Dangerous terminal commands (`rm -rf`, `sudo`, `curl | bash`, etc.) are blocked at the tool level
- JWT access tokens expire in 15 minutes; refresh tokens in 7 days, stored as HttpOnly cookies
- Rate limiting: 10 req/min on auth, 60 req/min on all other API endpoints
- All inputs validated with Zod before processing

---

## Documentation

| File | Contents |
|------|---------|
| [`docs/IBM_CLOUD_SETUP.md`](docs/IBM_CLOUD_SETUP.md) | Step-by-step guide to provision every IBM Cloud service |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System diagram, agent sequence, DB schema, security layers |
| [`docs/DEVELOPER_GUIDE.md`](docs/DEVELOPER_GUIDE.md) | How to add tools, code style, testing |

---

## License

Apache 2.0
