import type { PlayerInfo } from '@chaos-parcel/shared';
import {
  type ArenaObstacle,
  type ArenaPoint,
  type WallSegment,
  isCircleClearOfWalls,
  obstaclesToSegments,
  resolveCircleAgainstWalls,
} from './arenaObstacles';
import {
  ARENA_EDGE_INSET,
  type ArenaPlayer,
  clampArena,
} from './hostGameTypes';

/** Match movementRuntime player radius (normalized arena units). */
const SPAWN_RADIUS = 0.045;
const SPAWN_EDGE = Math.max(ARENA_EDGE_INSET, 0.08);
const MAX_ATTEMPTS = 80;

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Min gap between player centers — shrinks slightly as the roster grows. */
export function spawnMinPlayerGap(playerCount: number): number {
  return Math.max(0.14, Math.min(0.24, 0.52 / Math.sqrt(Math.max(playerCount, 1))));
}

function farEnoughFromPlayers(
  x: number,
  y: number,
  occupied: ReadonlyArray<Pick<ArenaPoint, 'x' | 'y'>>,
  minGap: number,
): boolean {
  for (const o of occupied) {
    if (Math.hypot(x - o.x, y - o.y) < minGap) return false;
  }
  return true;
}

/**
 * Random point on the floor: not on walls, spaced from other players.
 * Falls back to a wall-resolved sample if rejection sampling fails.
 */
export function pickSpreadSpawnPoint(
  walls: WallSegment[],
  occupied: ReadonlyArray<Pick<ArenaPoint, 'x' | 'y'>>,
  minGap: number,
): ArenaPoint {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const x = rand(SPAWN_EDGE, 1 - SPAWN_EDGE);
    const y = rand(SPAWN_EDGE, 1 - SPAWN_EDGE);
    if (!isCircleClearOfWalls(x, y, SPAWN_RADIUS, walls)) continue;
    if (!farEnoughFromPlayers(x, y, occupied, minGap)) continue;
    return { x, y };
  }

  // Soften spacing, then accept wall-resolved positions.
  const softGap = minGap * 0.7;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    let x = rand(SPAWN_EDGE, 1 - SPAWN_EDGE);
    let y = rand(SPAWN_EDGE, 1 - SPAWN_EDGE);
    const resolved = resolveCircleAgainstWalls(x, y, SPAWN_RADIUS, walls);
    x = clampArena(resolved.x, SPAWN_EDGE);
    y = clampArena(resolved.y, SPAWN_EDGE);
    if (!isCircleClearOfWalls(x, y, SPAWN_RADIUS, walls, 0.004)) continue;
    if (!farEnoughFromPlayers(x, y, occupied, softGap)) continue;
    return { x, y };
  }

  const fallback = resolveCircleAgainstWalls(
    rand(SPAWN_EDGE, 1 - SPAWN_EDGE),
    rand(SPAWN_EDGE, 1 - SPAWN_EDGE),
    SPAWN_RADIUS,
    walls,
  );
  return {
    x: clampArena(fallback.x, SPAWN_EDGE),
    y: clampArena(fallback.y, SPAWN_EDGE),
  };
}

function toArenaPlayer(player: PlayerInfo, pos: ArenaPoint): ArenaPlayer {
  return {
    playerId: player.player_id,
    nickname: player.nickname,
    color: player.character_color,
    avatar: player.avatar,
    x: pos.x,
    y: pos.y,
  };
}

/** Place one new player randomly, avoiding walls and already-placed tokens. */
export function playerInfoToArena(
  player: PlayerInfo,
  occupied: ReadonlyArray<ArenaPlayer> = [],
  obstacles: ReadonlyArray<ArenaObstacle> = [],
): ArenaPlayer {
  const walls = obstaclesToSegments([...obstacles]);
  const gap = spawnMinPlayerGap(occupied.length + 1);
  const pos = pickSpreadSpawnPoint(walls, occupied, gap);
  return toArenaPlayer(player, pos);
}

/**
 * Place the full roster randomly across the arena.
 * Obstacles (if any) are avoided; players stay spaced apart.
 */
export function placeRosterSpread(
  players: PlayerInfo[],
  obstacles: ReadonlyArray<ArenaObstacle> = [],
): ArenaPlayer[] {
  const walls = obstaclesToSegments([...obstacles]);
  const gap = spawnMinPlayerGap(players.length);
  const shuffled = [...players].sort(() => Math.random() - 0.5);
  const placed: ArenaPlayer[] = [];

  for (const player of shuffled) {
    const pos = pickSpreadSpawnPoint(walls, placed, gap);
    placed.push(toArenaPlayer(player, pos));
  }

  return placed;
}

/** Merge lobby roster into arena tokens, keeping existing positions when possible. */
export function syncArenaPlayers(
  players: PlayerInfo[],
  existing: ArenaPlayer[],
  obstacles: ReadonlyArray<ArenaObstacle> = [],
): ArenaPlayer[] {
  const byId = new Map(existing.map((p) => [p.playerId, p]));
  const kept: ArenaPlayer[] = [];

  for (const player of players) {
    const prev = byId.get(player.player_id);
    if (prev) {
      kept.push({
        ...prev,
        nickname: player.nickname,
        color: player.character_color,
        avatar: player.avatar,
      });
    }
  }

  const result = [...kept];
  for (const player of players) {
    if (byId.has(player.player_id)) continue;
    result.push(playerInfoToArena(player, result, obstacles));
  }

  return result;
}
