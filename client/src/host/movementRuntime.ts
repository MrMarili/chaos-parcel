import type { ArenaPlayer } from './hostGameTypes';
import { clampArena } from './hostGameTypes';
import {
  type ArenaObstacle,
  type WallSegment,
  circleTouchesWalls,
  hasLineOfSight,
  obstaclesToSegments,
  resolveCircleAgainstWalls,
} from './arenaObstacles';

interface Vec {
  x: number;
  y: number;
}

/** Token CSS size (border-box) — collision uses true pixel diameter. */
const TOKEN_SIZE_PX = 52;
/** Half of token for edge insets. */
const TOKEN_RADIUS_PX = TOKEN_SIZE_PX / 2;
/** Flip name above the token when center is this close to the bottom. */
const NAME_FLIP_BOTTOM = 0.86;
/** Shift name inward when center is this close to a side. */
const NAME_SHIFT_SIDE = 0.14;
/** Soft collision: resolve this fraction of overlap per pass. */
const SEPARATION_STRENGTH = 0.65;
/** Fixed pass count — party lobbies are small (≤~8 players). */
const SEPARATION_PASSES = 3;

const FREEZE_MS = 2000;
/** Obstacle contact shock — freeze + electrify VFX. */
const WALL_SHOCK_MS = 1000;
const CONFUSION_MS = 3000;
const MAGNET_MS = 3000;
/** Normalized arena units of knockback at shockwave center. */
const SHOCKWAVE_FORCE = 0.22;
const SHOCKWAVE_RADIUS = 0.45;
/** Magnet pull speed (arena units / sec toward package) — direction blend only. */
const MAGNET_PULL = 0.9;

/** Approximate player radius in normalized arena units (screen-dependent; ~half token). */
const PLAYER_RADIUS_NORM = 0.045;

const positions = new Map<string, Vec>();
const targetVelocities = new Map<string, Vec>();
const smoothVelocities = new Map<string, Vec>();
const elements = new Map<string, HTMLElement>();
const frozenUntil = new Map<string, number>();
const shockedUntil = new Map<string, number>();
const wasTouchingWall = new Map<string, boolean>();
const confusedUntil = new Map<string, number>();
const magnetUntil = new Map<string, number>();

let wallSegments: WallSegment[] = [];

/** Install / clear round obstacles for collision + LoS. */
export function setArenaObstacles(obstacles: ArenaObstacle[]): void {
  wallSegments = obstaclesToSegments(obstacles);
}

export function getWallSegments(): WallSegment[] {
  return wallSegments;
}

export function canSeePlayer(
  from: { x: number; y: number },
  to: { x: number; y: number },
): boolean {
  return hasLineOfSight(from, to, wallSegments);
}

function nowMs(): number {
  return performance.now();
}

function isFrozen(id: string): boolean {
  const until = frozenUntil.get(id);
  if (until === undefined) return false;
  if (nowMs() >= until) {
    frozenUntil.delete(id);
    updateStatusClass(id);
    return false;
  }
  return true;
}

function isConfused(id: string): boolean {
  const until = confusedUntil.get(id);
  if (until === undefined) return false;
  if (nowMs() >= until) {
    confusedUntil.delete(id);
    updateStatusClass(id);
    return false;
  }
  return true;
}

function isMagnetized(id: string): boolean {
  const until = magnetUntil.get(id);
  if (until === undefined) return false;
  if (nowMs() >= until) {
    magnetUntil.delete(id);
    updateStatusClass(id);
    return false;
  }
  return true;
}

function updateStatusClass(id: string): void {
  const el = elements.get(id);
  if (!el) return;
  const now = nowMs();
  el.classList.toggle('is-frozen', frozenUntil.has(id) && now < (frozenUntil.get(id) ?? 0));
  el.classList.toggle('is-shocked', shockedUntil.has(id) && now < (shockedUntil.get(id) ?? 0));
  el.classList.toggle('is-confused', confusedUntil.has(id) && now < (confusedUntil.get(id) ?? 0));
  el.classList.toggle('is-magnet', magnetUntil.has(id) && now < (magnetUntil.get(id) ?? 0));
}

function expireShocked(id: string): void {
  const until = shockedUntil.get(id);
  if (until === undefined) return;
  if (nowMs() >= until) {
    shockedUntil.delete(id);
    updateStatusClass(id);
  }
}

function edgeInsets(el: HTMLElement | undefined): { ix: number; iy: number } {
  const floor = el?.parentElement;
  if (!floor) return { ix: 0.05, iy: 0.05 };
  const { width, height } = floor.getBoundingClientRect();
  if (width < 1 || height < 1) return { ix: 0.05, iy: 0.05 };
  return {
    ix: Math.min(0.12, TOKEN_RADIUS_PX / width),
    iy: Math.min(0.12, TOKEN_RADIUS_PX / height),
  };
}

function updateNamePlacement(el: HTMLElement, pos: Vec): void {
  el.dataset.labelY = pos.y >= NAME_FLIP_BOTTOM ? 'above' : 'below';
  if (pos.x <= NAME_SHIFT_SIDE) el.dataset.labelX = 'right';
  else if (pos.x >= 1 - NAME_SHIFT_SIDE) el.dataset.labelX = 'left';
  else el.dataset.labelX = 'center';
}

function applyDom(id: string, pos: Vec): void {
  const el = elements.get(id);
  if (!el) return;
  el.style.left = `${pos.x * 100}%`;
  el.style.top = `${pos.y * 100}%`;
  updateNamePlacement(el, pos);
}

function clampPos(id: string, x: number, y: number): Vec {
  const { ix, iy } = edgeInsets(elements.get(id));
  let next = { x: clampArena(x, ix), y: clampArena(y, iy) };
  if (wallSegments.length > 0) {
    next = resolveCircleAgainstWalls(next.x, next.y, PLAYER_RADIUS_NORM, wallSegments);
    next = { x: clampArena(next.x, ix), y: clampArena(next.y, iy) };
  }
  return next;
}

function floorSizePx(): { width: number; height: number } | null {
  for (const el of elements.values()) {
    const floor = el.parentElement;
    if (!floor) continue;
    const { width, height } = floor.getBoundingClientRect();
    if (width >= 1 && height >= 1) return { width, height };
  }
  return null;
}

/**
 * Soft push-apart only when circles actually overlap in pixel space
 * (edge-to-edge contact — no artificial gap).
 */
function separatePlayers(): boolean {
  const ids = [...positions.keys()];
  if (ids.length < 2) return false;

  const floor = floorSizePx();
  if (!floor) return false;
  const { width: fw, height: fh } = floor;
  const minDistPx = TOKEN_SIZE_PX;
  let any = false;

  for (let pass = 0; pass < SEPARATION_PASSES; pass++) {
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const idA = ids[i]!;
        const idB = ids[j]!;
        const a = positions.get(idA)!;
        const b = positions.get(idB)!;

        let dxPx = (b.x - a.x) * fw;
        let dyPx = (b.y - a.y) * fh;
        let distPx = Math.hypot(dxPx, dyPx);
        if (distPx >= minDistPx) continue;

        if (distPx < 1e-4) {
          dxPx = 1;
          dyPx = 0;
          distPx = 1e-4;
        }

        const overlapPx = minDistPx - distPx;
        const nx = dxPx / distPx;
        const ny = dyPx / distPx;
        const pushPx = overlapPx * SEPARATION_STRENGTH * 0.5;
        const nextA = clampPos(
          idA,
          a.x - (nx * pushPx) / fw,
          a.y - (ny * pushPx) / fh,
        );
        const nextB = clampPos(
          idB,
          b.x + (nx * pushPx) / fw,
          b.y + (ny * pushPx) / fh,
        );
        a.x = nextA.x;
        a.y = nextA.y;
        b.x = nextB.x;
        b.y = nextB.y;
        any = true;
      }
    }
  }

  if (any) {
    for (const id of ids) {
      applyDom(id, positions.get(id)!);
    }
  }
  return any;
}

/** Bind / unbind a player token DOM node for direct position updates. */
export function bindPlayerElement(playerId: string, el: HTMLElement | null): void {
  if (!el) {
    elements.delete(playerId);
    return;
  }
  elements.set(playerId, el);
  const pos = positions.get(playerId);
  if (pos) applyDom(playerId, pos);
  updateStatusClass(playerId);
}

/** Ensure runtime has an entry for each arena player; drop leavers. */
export function syncMovementPlayers(
  players: ArenaPlayer[],
  options?: { resetPositions?: boolean },
): void {
  const live = new Set(players.map((p) => p.playerId));
  const reset = options?.resetPositions === true;

  for (const id of [...positions.keys()]) {
    if (!live.has(id)) {
      positions.delete(id);
      targetVelocities.delete(id);
      smoothVelocities.delete(id);
      elements.delete(id);
      frozenUntil.delete(id);
      shockedUntil.delete(id);
      wasTouchingWall.delete(id);
      confusedUntil.delete(id);
      magnetUntil.delete(id);
    }
  }

  for (const player of players) {
    const existing = positions.get(player.playerId);
    if (!existing || reset) {
      const pos = clampPos(player.playerId, player.x, player.y);
      positions.set(player.playerId, pos);
      if (!existing || reset) {
        targetVelocities.set(player.playerId, { x: 0, y: 0 });
        smoothVelocities.set(player.playerId, { x: 0, y: 0 });
      }
      applyDom(player.playerId, pos);
    } else {
      const next = clampPos(player.playerId, existing.x, existing.y);
      if (next.x !== existing.x || next.y !== existing.y) {
        existing.x = next.x;
        existing.y = next.y;
      }
      applyDom(player.playerId, existing);
    }
  }
}

export function setPlayerVelocity(playerId: string, x: number, y: number): void {
  if (isFrozen(playerId)) {
    targetVelocities.set(playerId, { x: 0, y: 0 });
    smoothVelocities.set(playerId, { x: 0, y: 0 });
    return;
  }
  if (isConfused(playerId)) {
    targetVelocities.set(playerId, { x: -x, y: -y });
    return;
  }
  targetVelocities.set(playerId, { x, y });
}

export function clearAllVelocities(): void {
  for (const id of targetVelocities.keys()) {
    targetVelocities.set(id, { x: 0, y: 0 });
    smoothVelocities.set(id, { x: 0, y: 0 });
  }
}

export function freezePlayer(playerId: string, durationMs = FREEZE_MS): void {
  frozenUntil.set(playerId, nowMs() + durationMs);
  targetVelocities.set(playerId, { x: 0, y: 0 });
  smoothVelocities.set(playerId, { x: 0, y: 0 });
  updateStatusClass(playerId);
}

/** Obstacle contact: freeze 1s + electrification VFX (holder or not). */
function shockPlayerFromWall(playerId: string): void {
  freezePlayer(playerId, WALL_SHOCK_MS);
  shockedUntil.set(playerId, nowMs() + WALL_SHOCK_MS);
  updateStatusClass(playerId);
}

export function confusePlayer(playerId: string, durationMs = CONFUSION_MS): void {
  confusedUntil.set(playerId, nowMs() + durationMs);
  updateStatusClass(playerId);
}

export function magnetizePlayer(playerId: string, durationMs = MAGNET_MS): void {
  magnetUntil.set(playerId, nowMs() + durationMs);
  updateStatusClass(playerId);
}

/** Instant knockback: push every other visible token away from the caster. */
export function applyShockwave(casterId: string): void {
  const origin = positions.get(casterId);
  if (!origin) return;

  for (const [id, pos] of positions) {
    if (id === casterId) continue;
    let dx = pos.x - origin.x;
    let dy = pos.y - origin.y;
    let dist = Math.hypot(dx, dy);
    if (dist > SHOCKWAVE_RADIUS) continue;
    if (!hasLineOfSight(origin, pos, wallSegments)) continue;
    if (dist < 1e-4) {
      dx = 1;
      dy = 0;
      dist = 1e-4;
    }
    const falloff = 1 - dist / SHOCKWAVE_RADIUS;
    const push = SHOCKWAVE_FORCE * falloff;
    const next = clampPos(id, pos.x + (dx / dist) * push, pos.y + (dy / dist) * push);
    pos.x = next.x;
    pos.y = next.y;
    applyDom(id, pos);
  }
}

export function resetMovementRuntime(): void {
  positions.clear();
  targetVelocities.clear();
  smoothVelocities.clear();
  elements.clear();
  frozenUntil.clear();
  shockedUntil.clear();
  wasTouchingWall.clear();
  confusedUntil.clear();
  magnetUntil.clear();
  wallSegments = [];
}

/**
 * Integrate positions for this frame and push to the DOM (no React).
 * Returns true if any player moved.
 */
export function tickMovement(
  dt: number,
  holderId: string | null,
  speedPerSec: number,
  packageMultiplier: number,
): boolean {
  const accelBlend = 1 - Math.exp(-22 * dt);
  let moved = false;

  // Magnet: pull caster toward current package holder (or arena center).
  const packagePos =
    (holderId ? positions.get(holderId) : null) ?? { x: 0.5, y: 0.5 };

  for (const [id, pos] of positions) {
    // Expire status flags so CSS clears even while idle.
    isFrozen(id);
    expireShocked(id);
    isConfused(id);
    isMagnetized(id);

    if (isFrozen(id)) {
      targetVelocities.set(id, { x: 0, y: 0 });
      smoothVelocities.set(id, { x: 0, y: 0 });
      continue;
    }

    let target = targetVelocities.get(id) ?? { x: 0, y: 0 };

    if (isMagnetized(id)) {
      const dx = packagePos.x - pos.x;
      const dy = packagePos.y - pos.y;
      const dist = Math.hypot(dx, dy);
      // Magnet only pulls when there is a clear line of sight to the package.
      if (dist > 0.02 && hasLineOfSight(pos, packagePos, wallSegments)) {
        const mx = (dx / dist) * MAGNET_PULL;
        const my = (dy / dist) * MAGNET_PULL;
        target = {
          x: Math.max(-1, Math.min(1, target.x * 0.35 + mx)),
          y: Math.max(-1, Math.min(1, target.y * 0.35 + my)),
        };
      }
    }

    const prev = smoothVelocities.get(id) ?? { x: 0, y: 0 };
    const releasing = Math.abs(target.x) < 0.05 && Math.abs(target.y) < 0.05;
    const smooth = releasing
      ? { x: 0, y: 0 }
      : {
          x: prev.x + (target.x - prev.x) * accelBlend,
          y: prev.y + (target.y - prev.y) * accelBlend,
        };
    if (Math.abs(smooth.x) < 0.002) smooth.x = 0;
    if (Math.abs(smooth.y) < 0.002) smooth.y = 0;
    smoothVelocities.set(id, smooth);

    if (smooth.x === 0 && smooth.y === 0) continue;

    const speed = speedPerSec * (holderId === id ? packageMultiplier : 1);
    const intendedX = pos.x + smooth.x * speed * dt;
    const intendedY = pos.y + smooth.y * speed * dt;
    const { ix, iy } = edgeInsets(elements.get(id));
    const intended = {
      x: clampArena(intendedX, ix),
      y: clampArena(intendedY, iy),
    };

    // Detect penetration before resolve so resting against a wall still counts.
    const enteringWall =
      wallSegments.length > 0 &&
      circleTouchesWalls(intended.x, intended.y, PLAYER_RADIUS_NORM, wallSegments);

    const next = clampPos(id, intendedX, intendedY);
    if (enteringWall && wasTouchingWall.get(id) !== true) {
      shockPlayerFromWall(id);
      wasTouchingWall.set(id, true);
    }

    if (next.x === pos.x && next.y === pos.y) continue;

    pos.x = next.x;
    pos.y = next.y;
    applyDom(id, pos);
    moved = true;
  }

  if (separatePlayers()) moved = true;

  // Keep contact flags in sync (including idle / frozen tokens).
  syncWallTouchFlags();

  return moved;
}

/** Update wasTouchingWall from resolved positions (no new shocks). */
function syncWallTouchFlags(): void {
  if (wallSegments.length === 0) {
    wasTouchingWall.clear();
    return;
  }
  for (const [id, pos] of positions) {
    // After resolve, tokens sit just outside walls — treat near-contact as still touching
    // so sliding / freeze-end against a wall does not re-trigger until they clear.
    const touching = circleTouchesWalls(pos.x, pos.y, PLAYER_RADIUS_NORM, wallSegments, 0.014);
    if (wasTouchingWall.get(id) === true && touching) {
      wasTouchingWall.set(id, true);
    } else if (!touching) {
      wasTouchingWall.set(id, false);
    }
  }
}

/** Copy runtime positions back onto arena player objects (for pass / scoring). */
export function readPositionsInto(players: ArenaPlayer[]): ArenaPlayer[] {
  return players.map((player) => {
    const pos = positions.get(player.playerId);
    if (!pos) return player;
    if (pos.x === player.x && pos.y === player.y) return player;
    return { ...player, x: pos.x, y: pos.y };
  });
}

export function getPosition(playerId: string): Vec | null {
  const pos = positions.get(playerId);
  return pos ? { ...pos } : null;
}
