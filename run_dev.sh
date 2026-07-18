#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

#############################################
# Dependency checks
#############################################

require() {
    command -v "$1" >/dev/null 2>&1 || {
        echo "Missing dependency: $1"
        exit 1
    }
}

if command -v npm >/dev/null 2>&1; then
    PKG_MANAGER="npm"
elif command -v pnpm >/dev/null 2>&1; then
    PKG_MANAGER="pnpm"
elif command -v yarn >/dev/null 2>&1; then
    PKG_MANAGER="yarn"
elif command -v bun >/dev/null 2>&1; then
    PKG_MANAGER="bun"
else
    echo "No package manager found."
    exit 1
fi

require node

#############################################
# Install dependencies
#############################################

echo "Installing frontend dependencies..."

case "$PKG_MANAGER" in
    npm)
        if [ -f package-lock.json ]; then
            npm install
        else
            npm install
        fi
        ;;
    pnpm)
        pnpm install
        ;;
    yarn)
        yarn install
        ;;
    bun)
        bun install
        ;;
esac

#############################################
# Environment
#############################################

if [ -f ".env.local" ]; then
    export $(grep -v '^#' .env.local | grep '=' | xargs -d '\n')
fi

#############################################
# Run Next.js
#############################################

echo ""
echo "=================================="
echo "Starting PDFNest Frontend (DEV)"
echo "=================================="
echo ""

case "$PKG_MANAGER" in
    npm)
        npm run dev
        ;;
    pnpm)
        pnpm dev
        ;;
    yarn)
        yarn dev
        ;;
    bun)
        bun run dev
        ;;
esac