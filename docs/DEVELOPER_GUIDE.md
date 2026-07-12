# Developer Guide

## Prerequisites

- Node.js 20+
- npm 10+
- Git
- PostgreSQL 16+ with pgvector (or Docker)
- IBM Cloud account

## Development Setup

### 1. Clone and install

```bash
git clone https://github.com/your-org/ibm-coding-agent.git
cd ibm-coding-agent
npm install
```

### 2. Environment

```bash
cp .env.example .env
# Fill in IBM Cloud credentials (see docs/IBM_CLOUD_SETUP.md)
```

### 3. Start database with Docker

```bash
docker run -d \
  --name ibm-pg \
  -e POSTGRES_DB=ibm_coding_agent \
  -e POSTGRES_USER=ibmagent \
  -e POSTGRES_PASSWORD=dev_password \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

Add to `.env`:
```
DATABASE_URL=postgresql://ibmagent:dev_password@localhost:5432/ibm_coding_agent
```

### 4. Run migrations

```bash
npm run db:migrate
npm run db:seed  # Creates admin@ibm-agent.local / Admin@123456!
```

### 5. Start development

```bash
npm run dev
```

- Frontend: http://localhost:3000
- API: http://localhost:3001
- API Health: http://localhost:3001/health

## Project Structure

```
ibm-coding-agent/
├── packages/           # Shared packages (types, shared, ai, tools)
├── apps/api/           # Express REST API
└── apps/web/           # Next.js 15 frontend
```

## Key Files

| File | Purpose |
|------|---------|
| `packages/ai/src/agent.ts` | Core agent loop |
| `packages/ai/src/watsonx-client.ts` | IBM watsonx.ai API client |
| `packages/ai/src/tools.ts` | Tool definitions for Granite |
| `packages/tools/src/executor.ts` | Tool dispatcher |
| `packages/tools/src/filesystem.ts` | Sandboxed file operations |
| `apps/api/src/routes/agent.ts` | SSE streaming endpoint |
| `apps/api/src/services/agent.service.ts` | Agent orchestration |
| `apps/web/src/components/chat/chat-panel.tsx` | Chat UI with SSE |
| `apps/web/src/stores/agent-store.ts` | Agent state (Zustand) |

## Adding a New Tool

### 1. Add the tool definition in `packages/ai/src/tools.ts`:

```typescript
{
  name: 'my_new_tool',
  description: 'What this tool does',
  parameters: {
    type: 'object',
    properties: {
      param1: { type: 'string', description: 'Description' },
    },
    required: ['param1'],
  },
},
```

### 2. Add the type to `packages/types/src/index.ts`:

```typescript
export type ToolName = ... | 'my_new_tool';
```

### 3. Add the implementation in `packages/tools/src/executor.ts`:

```typescript
case 'my_new_tool': {
  const result = await doSomething(args.param1 as string);
  return result;
}
```

## Authentication Flow

```
Login → POST /api/auth/login
     → Returns { accessToken (15min), refreshToken (7d in HttpOnly cookie) }

Request → Bearer <accessToken> in Authorization header
       → If 401 → POST /api/auth/refresh → new accessToken
       → If refresh fails → redirect to /auth/login
```

## Testing

```bash
# Unit tests
npm test --workspace=packages/ai

# API integration tests
npm test --workspace=apps/api

# Type checking (all packages)
npm run typecheck
```

## Building for Production

```bash
npm run build

# Or with Docker
docker-compose -f docker/docker-compose.yml up --build
```

## Code Style

- TypeScript strict mode
- Single quotes, no semicolons in some files, 100-char line width
- `prettier` for formatting: `npm run format`
- No `any` — use proper types or `unknown`
- Async/await over callbacks
- Proper error handling with custom error classes from `@ibm-agent/shared`

## Environment Variables Reference

See `.env.example` for all available variables with documentation.

## IBM Granite Code Model

The agent uses `ibm/granite-34b-code-instruct` by default. To change:

```bash
IBM_MODEL_ID=ibm/granite-8b-code-instruct  # Faster, cheaper
```

The model is called via IBM watsonx.ai's chat completion endpoint with full tool-calling support.
