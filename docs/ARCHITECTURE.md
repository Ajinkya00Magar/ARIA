# Architecture Reference

## System Architecture Diagram

```
                    ┌──────────────────────────────────────────────────┐
                    │                 User Browser                      │
                    │         Next.js 15 (IBM Coding Agent)            │
                    │                                                   │
                    │  ┌──────────┐  ┌───────────┐  ┌─────────────┐   │
                    │  │ Activity │  │  Monaco   │  │  AI Chat    │   │
                    │  │ Sidebar  │  │  Editor   │  │  Panel      │   │
                    │  │          │  │           │  │             │   │
                    │  │ Explorer │  │ Tabs      │  │ SSE Stream  │   │
                    │  │ Git      │  │ Diff View │  │ Tool Cards  │   │
                    │  │ Tasks    │  │ Syntax    │  │ Markdown    │   │
                    │  │ Memory   │  │ Highlight │  │ Permission  │   │
                    │  └──────────┘  └───────────┘  └─────────────┘   │
                    └──────────────────────┬───────────────────────────┘
                                           │ HTTPS / WSS
                    ┌──────────────────────▼───────────────────────────┐
                    │              Nginx Reverse Proxy                  │
                    │         (Rate Limiting, SSL Termination)          │
                    └──────────┬────────────────────┬───────────────────┘
                               │                    │
              ┌────────────────▼───┐   ┌────────────▼────────────────┐
              │   API Server        │   │    Next.js SSR Server       │
              │   Express/Node.js   │   │    Port 3000                │
              │   Port 3001         │   └─────────────────────────────┘
              │                     │
              │  ┌───────────────┐  │
              │  │ Auth Router   │  │
              │  │ Workspace     │  │
              │  │ Files         │  │
              │  │ Chat          │  │        ┌──────────────────────┐
              │  │ Agent SSE ────┼──┼────────▶  IBM watsonx.ai      │
              │  │ Terminal      │  │        │  Granite Code Model  │
              │  │ Git           │  │        │                      │
              │  │ Tasks         │  │        │  - Streaming Chat    │
              │  └───────────────┘  │        │  - Tool Calling      │
              │                     │        │  - Embeddings        │
              │  ┌───────────────┐  │        └──────────────────────┘
              │  │ Agent Service │  │
              │  │               │  │
              │  │ CodingAgent   │  │        ┌──────────────────────┐
              │  │ Tool Executor │  │        │  PostgreSQL           │
              │  │ MemoryManager │  │        │  (pgvector)           │
              │  └───────────────┘  │        │                      │
              │                     │◀──────▶│  Users, Workspaces  │
              │  ┌───────────────┐  │        │  Chats, Messages    │
              │  │ Tools         │  │        │  Tasks, Memories     │
              │  │               │  │        └──────────────────────┘
              │  │ FileSystem    │  │
              │  │ Terminal      │  │        ┌──────────────────────┐
              │  │ Git           │  │        │  IBM Object Storage  │
              │  │ Search        │  │◀──────▶│  Workspace Files     │
              │  │ Analyzer      │  │        └──────────────────────┘
              │  └───────────────┘  │
              └─────────────────────┘
```

## Agent Execution Flow (Sequence Diagram)

```
User         Frontend       API Server      Agent Service     watsonx.ai    Tool Executor
 │               │               │                │                │               │
 │─── Send ─────▶│               │                │                │               │
 │   Message     │─── POST ─────▶│                │                │               │
 │               │  /agent/run   │─── run() ─────▶│                │               │
 │               │  (SSE open)   │                │── chatStream() ▶│               │
 │               │               │                │◀── delta ──────│               │
 │◀── SSE ───────│◀── content ───│                │                │               │
 │   streaming   │   delta evt   │                │                │               │
 │               │               │                │                │               │
 │               │               │                │◀─ tool_call ───│               │
 │               │               │                │                │               │
 │               │               │                │── execute() ──────────────────▶│
 │               │               │                │                │  (file read,  │
 │               │               │                │                │   git status, │
 │               │               │                │                │   terminal)   │
 │◀── SSE ───────│◀── tool ──────│                │◀──── output ──────────────────│
 │  tool_start   │   start evt   │                │                │               │
 │               │               │                │── (next iter) ─▶│               │
 │               │               │                │◀── response ───│               │
 │◀── SSE ───────│◀── content ───│                │                │               │
 │   done        │   done evt    │◀── finalMsg ───│                │               │
 │               │               │  (save to DB)  │                │               │
```

## Memory Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Memory System                         │
│                                                          │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Conversation│  │  Workspace   │  │   Repository  │  │
│  │  Memory     │  │  Memory      │  │   Memory      │  │
│  │             │  │              │  │               │  │
│  │ Recent msgs │  │ Project info │  │ File summaries│  │
│  │ Context     │  │ Recent files │  │ Symbols       │  │
│  │ Preferences │  │ Recent cmds  │  │ Dependencies  │  │
│  └─────────────┘  └──────────────┘  └───────────────┘  │
│                           │                              │
│              ┌────────────▼────────────┐                │
│              │    Vector Store         │                │
│              │    (PostgreSQL +        │                │
│              │     pgvector)           │                │
│              │                         │                │
│              │  Embedding: 384-dim     │                │
│              │  IBM Slate Model        │                │
│              └─────────────────────────┘                │
└─────────────────────────────────────────────────────────┘
```

## Database Entity Relationship Diagram

```
┌──────────────┐     ┌──────────────────┐     ┌────────────────┐
│    users     │     │    workspaces    │     │     chats      │
├──────────────┤     ├──────────────────┤     ├────────────────┤
│ id (PK)      │◄────│ ownerId (FK)     │◄────│ workspaceId FK │
│ email        │     │ id (PK)          │     │ id (PK)        │
│ name         │     │ name             │     │ userId (FK)    │
│ passwordHash │     │ path             │     │ title          │
│ role         │     │ gitUrl           │     │ createdAt      │
│ provider     │     │ projectSummary   │     └────────────────┘
│ createdAt    │     │ status           │              │
└──────────────┘     │ isPinned         │              │
       │             └──────────────────┘         ┌────▼───────────┐
       │                      │                   │   messages     │
       │             ┌────────▼──────────┐        ├────────────────┤
       │             │ workspace_members  │        │ id (PK)        │
       │             ├───────────────────┤        │ chatId (FK)    │
       └────────────▶│ userId (FK)        │        │ role           │
                     │ workspaceId (FK)  │        │ content        │
                     │ role              │        │ toolCalls JSON │
                     └───────────────────┘        │ toolResults    │
                                                  └────────────────┘
┌──────────────┐     ┌──────────────────┐
│    tasks     │     │    memories      │
├──────────────┤     ├──────────────────┤
│ id (PK)      │     │ id (PK)          │
│ workspaceId  │     │ workspaceId (FK) │
│ userId (FK)  │     │ userId (FK)      │
│ status       │     │ type             │
│ progress     │     │ content          │
│ name         │     │ embedding []     │
│ error        │     │ metadata JSON    │
└──────────────┘     └──────────────────┘
```

## Security Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Security Layers                         │
│                                                          │
│  1. Transport    ┌─────────────────────────┐            │
│     Layer        │   HTTPS + TLS 1.3       │            │
│                  │   (Nginx termination)    │            │
│                  └─────────────────────────┘            │
│                                                          │
│  2. Rate         ┌─────────────────────────┐            │
│     Limiting     │  10 req/min (auth)       │            │
│                  │  60 req/min (API)        │            │
│                  │  10 req/min (agent)      │            │
│                  └─────────────────────────┘            │
│                                                          │
│  3. Input        ┌─────────────────────────┐            │
│     Validation   │   Zod schemas on all     │            │
│                  │   API endpoints          │            │
│                  └─────────────────────────┘            │
│                                                          │
│  4. Auth         ┌─────────────────────────┐            │
│     JWT          │   15min access tokens    │            │
│                  │   7-day refresh tokens   │            │
│                  │   HttpOnly cookies       │            │
│                  └─────────────────────────┘            │
│                                                          │
│  5. Workspace    ┌─────────────────────────┐            │
│     Sandbox      │   Path traversal check   │            │
│                  │   Forbidden paths list   │            │
│                  │   Max file size 10MB     │            │
│                  └─────────────────────────┘            │
│                                                          │
│  6. Dangerous    ┌─────────────────────────┐            │
│     Commands     │   Blocklist (rm -rf etc) │            │
│                  │   User confirmation flow │            │
│                  │   Permission timeout 30s │            │
│                  └─────────────────────────┘            │
└─────────────────────────────────────────────────────────┘
```
