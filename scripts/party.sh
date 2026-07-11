#!/usr/bin/env bash
# Party mode — run on your Mac/PC, open on TV + phones over the same Wi‑Fi.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CLIENT_PORT="${VITE_PORT:-5173}"
SERVER_PORT="${PORT:-3001}"
MODE="${1:-dev}"

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
info() { printf '\033[36m→ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m⚠️  %s\033[0m\n' "$*"; }

free_port() {
  local port="$1"
  local pids
  pids=$(lsof -ti:"$port" 2>/dev/null || true)
  if [[ -n "$pids" ]]; then
    warn "Port $port is in use — stopping old process(es): $pids"
    kill $pids 2>/dev/null || true
    sleep 0.5
    pids=$(lsof -ti:"$port" 2>/dev/null || true)
    if [[ -n "$pids" ]]; then
      kill -9 $pids 2>/dev/null || true
      sleep 0.3
    fi
  fi
}

stop_old_dev_stack() {
  # Stop lingering pnpm dev / tsx watch / vite from a previous `pnpm start` or `pnpm party`
  pkill -f "@chaos-parcel/server dev" 2>/dev/null || true
  pkill -f "@chaos-parcel/client dev" 2>/dev/null || true
  pkill -f "@chaos-parcel/shared dev" 2>/dev/null || true
  pkill -f "moving-package-party-game/server.*tsx watch" 2>/dev/null || true
  pkill -f "moving-package-party-game/client.*vite" 2>/dev/null || true
  sleep 0.5
}

detect_lan_ip() {
  if [[ "$(uname)" == "Darwin" ]]; then
    ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true
  else
    hostname -I 2>/dev/null | awk '{print $1}' || true
  fi
}

LAN_IP="${LAN_IP:-$(detect_lan_ip)}"
if [[ -z "$LAN_IP" ]]; then
  echo "Could not detect LAN IP. Set LAN_IP manually, e.g.: LAN_IP=192.168.1.5 pnpm party"
  exit 1
fi

export PARTY_MODE=true
export HOST=0.0.0.0

if ! command -v pnpm >/dev/null 2>&1; then
  corepack enable
  corepack prepare pnpm@9 --activate
fi

[[ -d node_modules ]] || pnpm install
pnpm --filter @chaos-parcel/shared build

bold "חבילה מתפוצצת — מצב מסיבה (רשת מקומית)"
echo ""
echo "  ודא שהמסך הראשי והטלפונים מחוברים לאותה רשת Wi‑Fi"
echo ""

if [[ "$MODE" == "prod" ]]; then
  stop_old_dev_stack

  info "Building production client..."
  pnpm --filter @chaos-parcel/client build
  pnpm --filter @chaos-parcel/server build

  export SERVE_CLIENT=true
  export PORT="$SERVER_PORT"
  export JOIN_BASE_URL="http://${LAN_IP}:${SERVER_PORT}/join"

  echo "  🖥️  מסך ראשי (מארח):  http://${LAN_IP}:${SERVER_PORT}/host"
  echo "  📱 שחקנים:            סרקו את ה-QR מהמסך"
  echo "  🔌 פורט יחיד:         ${SERVER_PORT} (קל לפתיחה ב-router)"
  echo ""
  echo "Press Ctrl+C to stop."
  echo ""

  stop_old_dev_stack
  free_port "$SERVER_PORT"
  free_port "$CLIENT_PORT"

  exec pnpm --filter @chaos-parcel/server start
fi

# Dev mode — Vite on 5173 + server on 3001
stop_old_dev_stack
free_port "$SERVER_PORT"
free_port "$CLIENT_PORT"
export JOIN_BASE_URL="http://${LAN_IP}:${CLIENT_PORT}/join"

bold "Starting dev party stack..."
echo ""
echo "  🖥️  מסך ראשי (מארח):  http://${LAN_IP}:${CLIENT_PORT}/host"
echo "  📱 שחקנים:            סרקו את ה-QR מהמסך"
echo "  🔌 WebSocket:          ws://${LAN_IP}:${SERVER_PORT}/ws"
echo ""
echo "  טיפ: לחוויה פשוטה יותר (פורט אחד) הרץ: pnpm party:prod"
echo ""
echo "Press Ctrl+C to stop."
echo ""

cleanup() {
  [[ -n "${PID_SHARED:-}" ]] && kill "$PID_SHARED" 2>/dev/null || true
  [[ -n "${PID_SERVER:-}" ]] && kill "$PID_SERVER" 2>/dev/null || true
  [[ -n "${PID_CLIENT:-}" ]] && kill "$PID_CLIENT" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

pnpm --filter @chaos-parcel/shared dev &
PID_SHARED=$!
pnpm --filter @chaos-parcel/server dev &
PID_SERVER=$!
pnpm --filter @chaos-parcel/client dev &
PID_CLIENT=$!
wait
