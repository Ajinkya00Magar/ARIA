# ARIA IDE

> A production-ready AI-powered Coding Agent Desktop Application powered by IBM watsonx.ai and IBM Granite Code.  
> An intelligent IDE for autonomous agentic software engineering.

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)
[![IBM watsonx.ai](https://img.shields.io/badge/Powered_by-IBM_watsonx.ai-0f62fe)](https://www.ibm.com/products/watsonx-ai)

---

## Overview

ARIA IDE is a comprehensive AI-powered software engineering platform that operates intelligently from your desktop. It:

- **Writes and refactors code** natively within its intelligent Monaco-based editor
- **Generates project plans** based on your goals and requirements
- **Executes commands** within an integrated pseudo-terminal
- **Manages file systems** seamlessly, performing edits and file creations autonomously
- **Operates autonomously** as an agentic assistant for complex software tasks

All powered by **IBM Granite Code** on **IBM watsonx.ai**.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Shell | Electron, electron-builder |
| Frontend | Next.js 15, TypeScript, TailwindCSS, Monaco Editor, Framer Motion, Zustand |
| Backend | Node.js, Express, TypeScript, Drizzle ORM |
| AI | IBM watsonx.ai — Granite Code (34B / 20B / 8B) |
| Database | SQLite local database |

---

## Project Structure

```
aria-production/
├── apps/
│   ├── api/          # Express REST API (Agent Backend)
│   ├── web/          # Next.js frontend (IDE UI)
│   ├── desktop/      # Electron desktop wrapper
│   └── landing/      # Next.js promotional landing page
```

---

## Building the Desktop App (Windows)

### Prerequisites

- **Node.js 20+** — [nodejs.org](https://nodejs.org)
- **npm 10+** — comes with Node 20
- **Windows OS**

### 1 — Clone and install

```bash
git clone https://github.com/your-org/aria-ide.git
cd aria-production
npm install
```

### 2 — Build the Setup Executable

To compile the entire monorepo into a single Windows installer executable (`.exe`):

```bash
cd apps/desktop
npm run build
```

This will:
1. Build the Express API (`apps/api`) running the Agent services.
2. Build and export the Next.js frontend (`apps/web`) containing the IDE UI.
3. Package all assets securely inside an ASAR archive.
4. Generate the installer executable inside `apps/desktop/dist/`.

### 3 — Installation

Double-click the generated `ARIA IDE Setup <version>.exe` file to install. 
Upon first launch, the app will present an onboarding screen asking for your IBM Cloud API credentials.

---

## Local Development

### 1 — Start development servers

```bash
npm run dev
```

This starts both apps in parallel via Turborepo:

| App | URL |
|-----|-----|
| Frontend (Next.js) | http://localhost:3000 |
| API (Express) | http://localhost:3001 |

You can use a standard browser to access the web frontend at `http://localhost:3000` for rapid UI iteration and IDE testing before packaging it in Electron.

---

## Security & Architecture

- **Local Persistence**: All configuration, agent memories, and project data are stored locally using SQLite (`local.db`) in the standard application user data folder.
- **Sandboxed Execution**: Agent terminal commands and file system operations are executed locally under the user's authority.
- **Background Monitoring**: The API runs safely alongside the Electron main process, ensuring the agent remains active only while the IDE is open.
- **Secure Modules**: Includes precompiled bindings for SQLite and node-pty to ensure maximum cross-platform compatibility on Windows.

---

## License

Apache 2.0
