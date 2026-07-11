/** WebSocket port when the client page is served separately (Vite dev on :5173). */
const WS_PORT = import.meta.env.VITE_WS_PORT ?? '3001';

/**
 * Resolves the WebSocket URL for the current environment.
 * - Production (single server): same host:port as the page
 * - Dev / LAN: hostname from the browser + WS port (default 3001)
 */
export function resolveWsUrl(): string {
  if (typeof window === 'undefined') {
    return import.meta.env.VITE_WS_URL ?? `ws://localhost:${WS_PORT}/ws`;
  }

  const envUrl = import.meta.env.VITE_WS_URL as string | undefined;
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

  // Built client served by the game server — WebSocket shares host:port
  if (import.meta.env.PROD && !import.meta.env.VITE_WS_PORT) {
    return `${protocol}//${window.location.host}/ws`;
  }

  // Ignore localhost env when opened from another device on the LAN
  if (!envUrl || envUrl.includes('localhost') || envUrl.includes('127.0.0.1')) {
    return `${protocol}//${window.location.hostname}:${WS_PORT}/ws`;
  }

  return envUrl;
}

export const JOIN_BASE_URL =
  import.meta.env.VITE_JOIN_BASE_URL ?? 'http://localhost:5173/join';

export const ABILITY_LABELS = {
  FREEZE: 'הקפאה',
  SHOCKWAVE: 'גל הדף',
  MAGNET: 'מגנט',
  CONFUSION: 'בלבול',
} as const;

export const ABILITY_ICONS = {
  FREEZE: '❄️',
  SHOCKWAVE: '💥',
  MAGNET: '🧲',
  CONFUSION: '🌀',
} as const;
