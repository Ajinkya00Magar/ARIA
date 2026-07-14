# ARIA — Agentic Repository Intelligence Assistant

**A production-grade AI coding IDE powered by IBM watsonx Orchestrate**

ARIA is a browser-based coding agent IDE that uses IBM watsonx Orchestrate as its primary intelligence layer. It can read, write, search, test, and debug code autonomously within a sandboxed workspace.

---

## Architecture

```
User
 ↓
ARIA Browser IDE (Next.js 15)
 ↓
ARIA API Gateway (Express + Socket.io)
 ↓
IBM watsonx Orchestrate Agent ← PRIMARY INTELLIGENCE
 ↓
Tool Call Requests
 ↓
Secure Local Tool Execution (sandboxed to workspace)
  ├── Filesystem (read_file, write_file, create_file, delete_file…)
  ├── Search (search_code, grep, find)
  ├── Terminal (run_terminal, execute_command)
  ├── Git (git_status, git_commit, git_diff, git_log…)
  └── Analysis (lint_project, build_project, run_tests)
 ↓
Tool Results → IBM watsonx Orchestrate
 ↓
Streamed Response + Action Events → SSE → ARIA IDE
```

IBM watsonx Orchestrate is the orchestration and reasoning layer. All local capabilities are tools available to the Orchestrate-driven agent — they do not replace it.

---

## Quick Start

### Prerequisites

- Node.js 18+
- An IBM watsonx Orchestrate agent endpoint
- IBM Cloud API Key (for IAM token exchange)

### 1. Clone and install

```bash
git clone <repo>
cd ibm-coding-agent
npm install --legacy-peer-deps --ignore-scripts
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your IBM credentials
```

Required environment variables:

```env
# Database
DATABASE_URL=file:./local.db    # SQLite for local dev

# Security
JWT_SECRET=<min 32 chars>
JWT_REFRESH_SECRET=<min 32 chars>

# IBM watsonx Orchestrate (PRIMARY AGENT)
IBM_ORCHESTRATE_URL=https://api.us-south.watson-orchestrate.cloud.ibm.com/instances/<id>/v1/orchestrate/<agent-id>/chat/completions
IBM_ORCHESTRATE_API_KEY=<your-api-key>

# IBM watsonx.ai (fallback / required by schema)
IBM_CLOUD_API_KEY=<your-api-key>
IBM_PROJECT_ID=<project-id>
IBM_WATSONX_URL=https://us-south.ml.cloud.ibm.com
IBM_MODEL_ID=ibm/granite-34b-code-instruct
```

### 3. Initialize database

```bash
cd apps/api
npm run db:migrate   # Run migrations
npm run db:seed      # Optional: seed demo user
```

### 4. Run in development

```bash
# Terminal 1: API
cd apps/api && npm run dev

# Terminal 2: Web
cd apps/web && npm run dev
```

Open http://localhost:3000

---

## Agent Routing

ARIA uses IBM watsonx Orchestrate as the **primary agent** whenever `IBM_ORCHESTRATE_URL` is configured:

| Condition | Agent Path |
|-----------|-----------|
| `IBM_ORCHESTRATE_URL` set | **IBM Orchestrate** (with local tools) |
| No `IBM_ORCHESTRATE_URL` | Local CodingAgent (watsonx fallback) |

The Orchestrate agent receives the full tool definitions and can call any local tool. Tool results are returned to Orchestrate, which continues reasoning until it completes the task.

---

## IBM Orchestrate Integration

The `OrchestrateClient` handles:
- IAM token acquisition and automatic refresh
- SSE streaming (text/event-stream) and JSON REST fallback
- OpenAI-compatible tool call format sent to Orchestrate
- Tool execution loop: Orchestrate calls → local execute → results back to Orchestrate
- Structured error codes: `IBM_AUTH_ERROR`, `IBM_RATE_LIMITED`, `IBM_TIMEOUT`, `IBM_SERVICE_UNAVAILABLE`
- Request timeout and cancellation

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15, React 19, Tailwind CSS, Framer Motion |
| Editor | Monaco Editor |
| Terminal | xterm.js + Socket.io (PTY via node-pty) |
| Backend | Express.js, Drizzle ORM, SQLite (local) |
| Agent | IBM watsonx Orchestrate (primary), watsonx.ai Granite (fallback) |
| Design | IBM Carbon Design System colors |

---

## Project Structure

```
ibm-coding-agent/
├── apps/
│   ├── api/          # Express backend
│   │   ├── src/
│   │   │   ├── routes/         # REST + SSE endpoints
│   │   │   ├── services/       # agent.service, orchestrate.client, auth…
│   │   │   ├── db/             # Drizzle schema + migrations
│   │   │   └── lib/            # env, logger, terminal-socket
│   │   └── migrations/
│   └── web/          # Next.js frontend
│       └── src/
│           ├── app/            # App Router pages
│           ├── components/     # IDE shell, chat panel, explorer…
│           ├── stores/         # Zustand (agent, workspace, auth)
│           └── hooks/
└── packages/
    ├── ai/           # WatsonxClient, CodingAgent, tool definitions
    ├── tools/        # ToolExecutor (filesystem, git, terminal, search)
    ├── types/        # Shared TypeScript types
    └── shared/       # Utilities, validators, constants
```

---

## Security

- All file operations are sandboxed to the assigned workspace directory
- Path traversal attacks are blocked by the ToolExecutor
- Destructive operations (delete, git push) require explicit user approval
- JWT authentication on all API routes
- IBM API keys and bearer tokens are never logged or sent to the frontend
- Rate limiting on auth endpoints

---

## Deployment

ARIA requires a **persistent Node.js server** (not serverless) because it:
- Maintains active WebSocket connections for the terminal
- Manages long-running agent tool executions
- Needs persistent filesystem for workspace storage

**Recommended:** Deploy `apps/api` on a VM, Railway, Fly.io, or similar. Deploy `apps/web` on Vercel or any Next.js host. Point `NEXT_PUBLIC_API_URL` to the API server.

**Do not** deploy the API to Vercel Functions or similar ephemeral runtimes — workspace state and terminal sessions will not persist.

---

## IBM Watsonx Orchestrate Setup

1. Create an agent in IBM watsonx Orchestrate
2. Note your agent deployment URL (format: `https://api.<region>.watson-orchestrate.cloud.ibm.com/instances/<id>/v1/orchestrate/<agent-id>/chat/completions`)
3. Generate an IBM Cloud API Key with access to your Orchestrate instance
4. Set `IBM_ORCHESTRATE_URL` and `IBM_ORCHESTRATE_API_KEY` in your `.env`

ARIA will use IAM token exchange to authenticate with your Orchestrate endpoint.
