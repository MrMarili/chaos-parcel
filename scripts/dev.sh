#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SERVER_PORT="${PORT:-3001}"
CLIENT_PORT="${VITE_PORT:-5173}"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
warn() { printf '\033[33m⚠️  %s\033[0m\n' "$*"; }
info() { printf '\033[36m→ %s\033[0m\n' "$*"; }

cleanup() {
  if [[ -n "${PID_SHARED:-}" ]]; then kill "$PID_SHARED" 2>/dev/null || true; fi
  if [[ -n "${PID_SERVER:-}" ]]; then kill "$PID_SERVER" 2>/dev/null || true; fi
  if [[ -n "${PID_CLIENT:-}" ]]; then kill "$PID_CLIENT" 2>/dev/null || true; fi
}
trap cleanup EXIT INT TERM

if ! command -v pnpm >/dev/null 2>&1; then
  warn "pnpm not found — enabling via corepack..."
  corepack enable
  corepack prepare pnpm@9 --activate
fi

if [[ ! -d node_modules ]]; then
  info "Installing dependencies..."
  pnpm install
fi

if [[ ! -f server/.env ]]; then
  warn "server/.env missing — copying from server/.env.example"
  cp server/.env.example server/.env
fi

if [[ ! -f client/.env ]]; then
  warn "client/.env missing — copying from client/.env.example"
  cp client/.env.example client/.env
fi

if lsof -ti:"$SERVER_PORT" >/dev/null 2>&1; then
  warn "Port $SERVER_PORT is already in use (server may already be running)"
fi

info "Building shared protocol package..."
pnpm --filter @chaos-parcel/shared build

bold "Starting Chaos Parcel dev stack..."
echo ""
echo "  Host (TV):     http://localhost:${CLIENT_PORT}/host"
echo "  Player join:   http://localhost:${CLIENT_PORT}/join/<ROOM_CODE>"
echo "  WebSocket:     ws://localhost:${SERVER_PORT}/ws"
echo "  Health check:  http://localhost:${SERVER_PORT}/health"
echo ""
echo "Press Ctrl+C to stop all services."
echo ""

pnpm --filter @chaos-parcel/shared dev &
PID_SHARED=$!

pnpm --filter @chaos-parcel/server dev &
PID_SERVER=$!

pnpm --filter @chaos-parcel/client dev &
PID_CLIENT=$!

wait
