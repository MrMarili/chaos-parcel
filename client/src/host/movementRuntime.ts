import type { AbilityType } from '@chaos-parcel/shared';
import { ABILITY_WAVE_MS } from '@chaos-parcel/shared';
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

export interface AbilityWaveVisual {
  casterId: string;
  type: AbilityType;
  color: string;
  x: number;
  y: number;
  radius: number;
}

interface AbilityWave {
  casterId: string;
  type: AbilityType;
  startedAt: number;
  maxRadius: number;
  color: string;
  hitIds: Set<string>;
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
/** Expanding ability wave (caster → max radius over this duration). */
export { ABILITY_WAVE_MS };
/** Time to grow from 0 → max radius (then ring stays until wave ends). */
export const ABILITY_WAVE_EXPAND_MS = 800;
/** Max wave radius in normalized arena units (0–1) — small AoE around the caster. */
export const ABILITY_WAVE_RADIUS = 0.16;
/** Outward push speed (normalized units / sec) while inside a shockwave. */
const SHOCKWAVE_PUSH_SPEED = 0.72;
/** Magnet pull strength — direction blend toward magnet target. */
const MAGNET_PULL = 0.9;

export const ABILITY_WAVE_COLORS: Record<AbilityType, string> = {
  FREEZE: '#35b6e0',
  SHOCKWAVE: '#f5b942',
  MAGNET: '#b24fe0',
  CONFUSION: '#7cff6b',
};

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
/** Magnetized victim → caster they are pulled toward. */
const magnetToward = new Map<string, string>();
/** One expanding wave per caster (new ability replaces previous). */
const abilityWaves = new Map<string, AbilityWave>();
/** Victim ids hit by waves since last drain (for host stats). */
const pendingAbilityHits: string[] = [];

let wallSegments: WallSegment[] = [];
const waveRingEls = new Map<string, SVGSVGElement>();
/** Angular samples for obstacle-clipped wave outline. */
const WAVE_RAY_COUNT = 72;
/** Break the stroke when adjacent rays differ by more than this (normalized). */
const WAVE_ARC_BREAK = 0.032;

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
    magnetToward.delete(id);
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
      magnetToward.delete(id);
      if (abilityWaves.has(id)) {
        abilityWaves.delete(id);
        removeWaveVisual(id);
      }
      for (const [victimId, towardId] of [...magnetToward.entries()]) {
        if (towardId === id) magnetToward.delete(victimId);
      }
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

function removeWaveVisual(casterId: string): void {
  const ring = waveRingEls.get(casterId);
  if (ring?.parentNode) ring.parentNode.removeChild(ring);
  waveRingEls.delete(casterId);
  for (const node of document.querySelectorAll(
    `[data-ability-wave="${CSS.escape(casterId)}"]`,
  )) {
    node.remove();
  }
}

function clearAllWaveVisuals(): void {
  for (const id of [...waveRingEls.keys()]) {
    removeWaveVisual(id);
  }
  waveRingEls.clear();
  for (const node of document.querySelectorAll('[data-ability-wave]')) {
    node.remove();
  }
}

function waveRadiusAt(elapsedMs: number, maxRadius: number): number {
  const expandT = Math.min(1, Math.max(0, elapsedMs / ABILITY_WAVE_EXPAND_MS));
  return maxRadius * expandT;
}

/** Arena floor that holds player tokens — wave SVG attaches here. */
function resolveArenaFloor(): HTMLElement | null {
  for (const el of elements.values()) {
    const parent = el.parentElement;
    if (parent?.classList.contains('host-arena-floor')) return parent;
  }
  return null;
}

function closestPointOnSeg(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): Vec {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1e-12) return { x: ax, y: ay };
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lenSq));
  return { x: ax + abx * t, y: ay + aby * t };
}

/**
 * How far a ray from origin may travel before hitting a thick wall surface.
 * Free directions keep expanding to maxR; blocked ones stop at the obstacle.
 */
function raycastMaxReach(
  origin: Vec,
  dirX: number,
  dirY: number,
  maxR: number,
): number {
  if (wallSegments.length === 0) return maxR;
  let reach = maxR;
  for (const w of wallSegments) {
    const half = w.thickness * 0.5 + 0.003;
    let lo = 0;
    let hi = maxR;
    let hit = false;
    for (let i = 0; i < 14; i++) {
      const mid = (lo + hi) * 0.5;
      const px = origin.x + dirX * mid;
      const py = origin.y + dirY * mid;
      const c = closestPointOnSeg(px, py, w.ax, w.ay, w.bx, w.by);
      if (Math.hypot(px - c.x, py - c.y) <= half) {
        hi = mid;
        hit = true;
      } else {
        lo = mid;
      }
    }
    if (hit) reach = Math.min(reach, hi);
  }
  return Math.max(0.002, reach);
}

/** SVG path of broken arcs: expands fully where open, stops against walls. */
function buildClippedWavePath(origin: Vec, radius: number): string {
  const reaches: number[] = [];
  for (let i = 0; i < WAVE_RAY_COUNT; i++) {
    const ang = (i / WAVE_RAY_COUNT) * Math.PI * 2;
    reaches.push(
      raycastMaxReach(origin, Math.cos(ang), Math.sin(ang), radius),
    );
  }

  let d = '';
  for (let i = 0; i < WAVE_RAY_COUNT; i++) {
    const ang = (i / WAVE_RAY_COUNT) * Math.PI * 2;
    const r = reaches[i]!;
    const x = origin.x + Math.cos(ang) * r;
    const y = origin.y + Math.sin(ang) * r;
    const prevR = reaches[(i - 1 + WAVE_RAY_COUNT) % WAVE_RAY_COUNT]!;
    const broken = i === 0 || Math.abs(r - prevR) > WAVE_ARC_BREAK;
    d += broken ? `M ${x.toFixed(4)} ${y.toFixed(4)} ` : `L ${x.toFixed(4)} ${y.toFixed(4)} `;
  }
  return d.trim();
}

function ensureWaveSvg(casterId: string, color: string): SVGSVGElement | null {
  const floor = resolveArenaFloor();
  if (!floor) return null;

  let svg = waveRingEls.get(casterId);
  const orphans = [
    ...document.querySelectorAll(`[data-ability-wave="${CSS.escape(casterId)}"]`),
  ] as SVGSVGElement[];
  if (svg && !orphans.includes(svg)) orphans.push(svg);

  if (orphans.length > 0) {
    svg = orphans[0]!;
    for (let i = 1; i < orphans.length; i++) orphans[i]!.remove();
    if (svg.parentElement !== floor) floor.appendChild(svg);
    waveRingEls.set(casterId, svg);
  }

  if (!svg) {
    svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('host-ability-wave-svg');
    svg.dataset.abilityWave = casterId;
    svg.setAttribute('viewBox', '0 0 1 1');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.setAttribute('aria-hidden', 'true');

    const glow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    glow.classList.add('host-ability-wave-glow');
    const core = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    core.classList.add('host-ability-wave-path');
    svg.appendChild(glow);
    svg.appendChild(core);
    floor.appendChild(svg);
    waveRingEls.set(casterId, svg);
  }

  svg.style.setProperty('--wave-color', color);
  return svg;
}

function updateWaveVisual(
  casterId: string,
  origin: Vec,
  radius: number,
  color: string,
): void {
  const svg = ensureWaveSvg(casterId, color);
  if (!svg) return;

  const pathD = buildClippedWavePath(origin, Math.max(0.002, radius));
  const glow = svg.querySelector('.host-ability-wave-glow');
  const core = svg.querySelector('.host-ability-wave-path');
  if (glow) glow.setAttribute('d', pathD);
  if (core) core.setAttribute('d', pathD);
  svg.style.setProperty('--wave-color', color);
}

/** Kept for HostArena compatibility — visuals are owned by the runtime. */
export function bindAbilityWaveLayer(_el: HTMLElement | null): void {
  // no-op
}

/**
 * Start (or replace) an expanding ability wave for this caster.
 * Only one wave per caster — a new cast cancels the previous.
 */
export function startAbilityWave(casterId: string, type: AbilityType): void {
  if (!positions.has(casterId)) return;
  removeWaveVisual(casterId);
  abilityWaves.set(casterId, {
    casterId,
    type,
    startedAt: nowMs(),
    maxRadius: ABILITY_WAVE_RADIUS,
    color: ABILITY_WAVE_COLORS[type],
    hitIds: new Set(),
  });
  const origin = positions.get(casterId)!;
  updateWaveVisual(casterId, origin, 0.001, ABILITY_WAVE_COLORS[type]);
}

/** Drain victim ids hit by ability waves since last call (host stats). */
export function drainAbilityHits(): string[] {
  if (pendingAbilityHits.length === 0) return [];
  const hits = pendingAbilityHits.splice(0, pendingAbilityHits.length);
  return hits;
}

/** Continuous radial push away from wave center (while victim stays inside). */
function pushPlayerOutward(
  origin: Vec,
  victimId: string,
  pos: Vec,
  dist: number,
  radius: number,
  dt: number,
): void {
  let dx = pos.x - origin.x;
  let dy = pos.y - origin.y;
  let d = dist;
  if (d < 1e-4) {
    dx = 1;
    dy = 0;
    d = 1e-4;
  }
  // Stronger near the caster so packed players get flung to the rim.
  const falloff = Math.max(0.45, 1 - d / Math.max(radius, 1e-4));
  const step = SHOCKWAVE_PUSH_SPEED * falloff * dt;
  const nx = (dx / d) * step;
  const ny = (dy / d) * step;
  const next = clampPos(victimId, pos.x + nx, pos.y + ny);
  pos.x = next.x;
  pos.y = next.y;
  // Nudge velocity outward so walking into the blast still loses.
  const boost = Math.min(1, falloff + 0.25);
  smoothVelocities.set(victimId, {
    x: Math.max(-1, Math.min(1, (dx / d) * boost)),
    y: Math.max(-1, Math.min(1, (dy / d) * boost)),
  });
  applyDom(victimId, pos);
}

function applyWaveHit(wave: AbilityWave, victimId: string): void {
  pendingAbilityHits.push(victimId);
  switch (wave.type) {
    case 'FREEZE':
      freezePlayer(victimId, ABILITY_WAVE_MS);
      break;
    case 'CONFUSION':
      confusePlayer(victimId, ABILITY_WAVE_MS);
      break;
    case 'MAGNET':
      magnetizePlayer(victimId, ABILITY_WAVE_MS);
      magnetToward.set(victimId, wave.casterId);
      break;
    case 'SHOCKWAVE':
      // Handled every frame while inside — see tickAbilityWaves.
      break;
  }
}

function tickAbilityWaves(dt: number): void {
  const now = nowMs();
  for (const [casterId, wave] of [...abilityWaves.entries()]) {
    const elapsed = now - wave.startedAt;
    if (elapsed >= ABILITY_WAVE_MS) {
      abilityWaves.delete(casterId);
      removeWaveVisual(casterId);
      continue;
    }

    const origin = positions.get(casterId);
    if (!origin) {
      abilityWaves.delete(casterId);
      removeWaveVisual(casterId);
      continue;
    }

    const radius = waveRadiusAt(elapsed, wave.maxRadius);
    // Per-direction expansion: free angles keep growing; wall hits clip that sector only.
    updateWaveVisual(casterId, origin, radius, wave.color);

    for (const [id, pos] of positions) {
      if (id === casterId) continue;
      const distNorm = Math.hypot(pos.x - origin.x, pos.y - origin.y);
      if (distNorm > radius) continue;
      // Cannot affect through obstacles (same clipping as the broken ring).
      if (!hasLineOfSight(origin, pos, wallSegments)) continue;

      if (wave.type === 'SHOCKWAVE') {
        // Keep shoving everyone the ring currently contains, outward.
        pushPlayerOutward(origin, id, pos, distNorm, radius, dt);
        if (!wave.hitIds.has(id)) {
          wave.hitIds.add(id);
          pendingAbilityHits.push(id);
        }
        continue;
      }

      if (wave.hitIds.has(id)) continue;
      wave.hitIds.add(id);
      applyWaveHit(wave, id);
    }
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
  magnetToward.clear();
  abilityWaves.clear();
  pendingAbilityHits.length = 0;
  clearAllWaveVisuals();
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

  tickAbilityWaves(dt);

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
      const towardId = magnetToward.get(id);
      const pullTarget = (towardId ? positions.get(towardId) : null) ?? null;
      if (pullTarget) {
        const dx = pullTarget.x - pos.x;
        const dy = pullTarget.y - pos.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.02) {
          const mx = (dx / dist) * MAGNET_PULL;
          const my = (dy / dist) * MAGNET_PULL;
          target = {
            x: Math.max(-1, Math.min(1, target.x * 0.35 + mx)),
            y: Math.max(-1, Math.min(1, target.y * 0.35 + my)),
          };
        }
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
