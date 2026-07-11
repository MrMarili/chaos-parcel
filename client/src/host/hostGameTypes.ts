import type { AbilityType, GameEndPayload, GameStatePayload, PlayerInfo } from '@chaos-parcel/shared';
import type { ArenaObstacle } from './arenaObstacles';

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
  /** Seconds left in the current round (TV countdown). */
  roundRemainingSec: number;
  arenaPlayers: ArenaPlayer[];
  /** Round obstacles (host-only collision + LoS + render). */
  obstacles: ArenaObstacle[];
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
  /** Final standings after the last round — shown on the host summary screen. */
  gameEnd: GameEndPayload | null;
}

/** Safe Hebrew fallback — avoids stray "?" in RTL text. */
export function displayName(nickname?: string | null): string {
  const trimmed = nickname?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : 'שחקן לא ידוע';
}

/** Resolve a display name from arena tokens first, then the lobby roster. */
export function resolvePlayerName(
  playerId: string | null | undefined,
  arenaPlayers: ArenaPlayer[],
  roster: PlayerInfo[],
): string {
  if (!playerId) return displayName(null);
  const fromArena = arenaPlayers.find((p) => p.playerId === playerId);
  if (fromArena?.nickname?.trim()) return displayName(fromArena.nickname);
  const fromRoster = roster.find((p) => p.player_id === playerId);
  return displayName(fromRoster?.nickname);
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
/** Arena units per second at full stick (arena is 0–1). */
export const MOVE_SPEED_PER_SEC = 0.34;
/** Package holder is noticeably faster than empty-handed players. */
export const PACKAGE_MOVE_MULTIPLIER = 1.22;
export const MIN_PLAYERS = 2;

export const ABILITY_DESCRIPTIONS: Record<AbilityType, string> = {
  FREEZE: 'גל הקפאה ל-5 שנ׳ — מקפיא מי שנכנס לעיגול',
  SHOCKWAVE: 'גל הדף ל-5 שנ׳ — דוחף החוצה את כל מי שבתוך העיגול',
  MAGNET: 'גל מגנט ל-5 שנ׳ — מושך אלייך מי שנכנס לעיגול',
  CONFUSION: 'גל בלבול ל-5 שנ׳ — מבלבל מי שנכנס לעיגול',
};

/**
 * Max normalized arena distance to allow a package pass (~touching / very close).
 * Arena coords are 0–1; token diameter is roughly 0.1–0.2 depending on screen size.
 */
export const PACKAGE_PASS_RANGE = 0.16;

export function buildGameStatePayload(
  roomCode: string,
  snapshot: HostGameSnapshot,
  players: PlayerInfo[],
): GameStatePayload {
  const holderId = snapshot.packageHolderId;
  let can_pass = false;
  if (snapshot.phase === 'playing' && holderId) {
    const holder = snapshot.arenaPlayers.find((p) => p.playerId === holderId);
    if (holder) {
      can_pass = findNearestPlayer(holder, snapshot.arenaPlayers, PACKAGE_PASS_RANGE) !== null;
    }
  }

  return {
    room_code: roomCode,
    status: snapshot.phase === 'playing' ? 'IN_GAME' : 'LOBBY',
    round: snapshot.round,
    package_holder_id: snapshot.packageHolderId,
    timer_seconds: snapshot.packageTimer,
    can_pass,
    players,
  };
}

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/**
 * Keep the player token (circle) fully inside the floor.
 * Name labels flip near edges in the DOM — they are not part of this inset.
 */
export const ARENA_EDGE_INSET = 0.05;

export function clampArena(value: number, inset = ARENA_EDGE_INSET): number {
  return Math.min(1 - inset, Math.max(inset, value));
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
  maxDistance = PACKAGE_PASS_RANGE,
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
