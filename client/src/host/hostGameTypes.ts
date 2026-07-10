import type { AbilityType, GameStatePayload, PlayerInfo } from '@chaos-parcel/shared';

export type HostPhase = 'lobby' | 'playing' | 'round_end' | 'summary';

export interface ArenaPlayer {
  playerId: string;
  nickname: string;
  color: string;
  avatar?: string;
  x: number;
  y: number;
}

export type LogType =
  | 'start'
  | 'round'
  | 'pass'
  | 'ability'
  | 'explosion'
  | 'end'
  | 'info';

export interface LogEntry {
  id: string;
  type: LogType;
  text: string;
}

export const LOG_ICONS: Record<LogType, string> = {
  start: '🚀',
  round: '🏁',
  pass: '🤾',
  ability: '✨',
  explosion: '💥',
  end: '🏆',
  info: 'ℹ️',
};

let logCounter = 0;
export function makeLog(type: LogType, text: string): LogEntry {
  logCounter += 1;
  return { id: `log_${Date.now()}_${logCounter}`, type, text };
}

export interface HostGameSnapshot {
  phase: HostPhase;
  round: number;
  packageHolderId: string | null;
  packageTimer: number;
  arenaPlayers: ArenaPlayer[];
  activityLog: LogEntry[];
  roundScores: Record<string, number>;
  roundExplosionCounts: Record<string, number>;
  /** Seconds spent without the package this round (time bonus). */
  timeWithoutPackage: Record<string, number>;
  /** Abilities received this game (for fun facts). */
  abilitiesReceived: Record<string, number>;
  lastExplosion: {
    playerId: string;
    nickname: string;
    startedAt: number;
  } | null;
  roundEndCountdown: number | null;
  roundEndStandings: Array<{
    player_id: string;
    nickname: string;
    character_color: string;
    avatar?: string;
    round_score: number;
    total_score: number;
    survived: boolean;
    had_explosion: boolean;
    explosion_count?: number;
  }> | null;
}

/** Safe Hebrew fallback — avoids stray "?" in RTL text. */
export function displayName(nickname?: string | null): string {
  const trimmed = nickname?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'שחקן לא ידוע';
}

/** Wrap player name for correct BiDi rendering inside Hebrew sentences. */
export function ltrName(nickname: string): string {
  return `\u2066${nickname}\u2069`;
}

export const PACKAGE_TIMER_MAX = 15;
export const ROUND_DURATION_SEC = 45;
export const ROUND_END_PAUSE_SEC = 5;
export const EXPLOSION_DISPLAY_MS = 2500;
export const TOTAL_ROUNDS = 5;
export const MOVE_SPEED = 0.018;
export const MIN_PLAYERS = 2;

export const ABILITY_DESCRIPTIONS: Record<AbilityType, string> = {
  FREEZE: 'מקפיא שחקן ל-2 שניות',
  SHOCKWAVE: 'דוחף את כולם הרחק ממך',
  MAGNET: 'מושך את החבילה אליך',
  CONFUSION: 'הופך את כיוון התנועה של יריב',
};

export function playerInfoToArena(player: PlayerInfo, index: number): ArenaPlayer {
  const angle = (index / Math.max(player.player_id.length, 1)) * Math.PI * 2;
  return {
    playerId: player.player_id,
    nickname: player.nickname,
    color: player.character_color,
    avatar: player.avatar,
    x: 0.5 + Math.cos(angle) * 0.2,
    y: 0.5 + Math.sin(angle) * 0.2,
  };
}

export function buildGameStatePayload(
  roomCode: string,
  snapshot: HostGameSnapshot,
  players: PlayerInfo[],
): GameStatePayload {
  return {
    room_code: roomCode,
    status: snapshot.phase === 'playing' ? 'IN_GAME' : 'LOBBY',
    round: snapshot.round,
    package_holder_id: snapshot.packageHolderId,
    timer_seconds: snapshot.packageTimer,
    players,
  };
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function pickRandomHolder(players: ArenaPlayer[], excludeId?: string): string | null {
  const pool = excludeId
    ? players.filter((p) => p.playerId !== excludeId)
    : players;
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)]!.playerId;
}

export function findNearestPlayer(
  from: ArenaPlayer,
  players: ArenaPlayer[],
  maxDistance = 0.15,
): ArenaPlayer | null {
  let nearest: ArenaPlayer | null = null;
  let minDist = maxDistance;
  for (const p of players) {
    if (p.playerId === from.playerId) continue;
    const dist = Math.hypot(p.x - from.x, p.y - from.y);
    if (dist < minDist) {
      minDist = dist;
      nearest = p;
    }
  }
  return nearest;
}
