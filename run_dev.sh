#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

PORT="${PORT:-3000}"

stop_port_listener() {
    local port="$1" pids pid
    pids="$(lsof -nP -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
    [ -n "$pids" ] || return 0

    echo "Port $port is already in use by:"
    ps -o pid=,user=,command= -p $pids
    read -r -p "Stop this process and continue? [y/N] " reply
    case "$reply" in
        [yY]|[yY][eE][sS]) ;;
        *) echo "Cancelled; port $port remains in use."; exit 1 ;;
    esac

    for pid in $pids; do kill "$pid" 2>/dev/null || true; done
    for _ in {1..10}; do
        sleep 1
        lsof -nP -t -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1 || return 0
    done
    echo "The process did not stop cleanly; forcing it to stop."
    for pid in $pids; do kill -KILL "$pid" 2>/dev/null || true; done
}

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
require lsof

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

set -o allexport
source .env.local
set +o allexport

#############################################
# Run Next.js
#############################################

echo ""
echo "=================================="
echo "Starting Platen PDF Frontend (DEV)"
echo "=================================="
echo ""

stop_port_listener "$PORT"

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
