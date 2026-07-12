#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# IBM Coding Agent — Setup Script
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

echo "🚀 Setting up IBM Coding Agent..."

# Check Node.js version
NODE_VERSION=$(node --version | cut -d. -f1 | cut -dv -f2)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo "❌ Node.js 20+ is required. You have $(node --version)"
    exit 1
fi
echo "✅ Node.js $(node --version)"

# Check npm
echo "✅ npm $(npm --version)"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

# Copy .env.example if .env doesn't exist
if [ ! -f .env ]; then
    echo ""
    echo "📋 Creating .env from .env.example..."
    cp .env.example .env
    echo "⚠️  Please fill in your credentials in .env before running!"
fi

# Create workspace directory
WORKSPACE_DIR=${WORKSPACE_ROOT:-/tmp/ibm-agent-workspaces}
mkdir -p "$WORKSPACE_DIR"
echo "✅ Workspace directory: $WORKSPACE_DIR"

# Build packages
echo ""
echo "🔨 Building packages..."
npm run build --workspace=packages/types
npm run build --workspace=packages/shared
npm run build --workspace=packages/ai
npm run build --workspace=packages/tools

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "  1. Fill in .env with your IBM Cloud credentials"
echo "  2. Start PostgreSQL (or use Docker: npm run docker:up)"
echo "  3. Run database migrations: npm run db:migrate"
echo "  4. Start development: npm run dev"
echo ""
echo "🔗 IBM Cloud credentials guide: docs/IBM_CLOUD_SETUP.md"
