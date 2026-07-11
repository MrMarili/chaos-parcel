/**
 * Arena obstacles — host-only geometry for collision, line-of-sight, and SVG render.
 * Coordinates are normalized 0–1 on the arena floor (same space as player tokens).
 */

export type ObstacleKind = 'straight' | 'curve' | 'corner_sharp' | 'corner_round';

export interface ArenaPoint {
  x: number;
  y: number;
}

export interface ArenaObstacle {
  id: string;
  kind: ObstacleKind;
  color: string;
  /** Stroke thickness in normalized arena units. */
  thickness: number;
  /**
   * Path control points:
   * - straight: [start, end]
   * - curve: [start, control, end]
   * - corner_*: [start, corner, end]
   */
  points: ArenaPoint[];
}

/** Thick wall segment used for collision + raycasts. */
export interface WallSegment {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  thickness: number;
}

/** Recommendation B: 5–7 obstacles per round. */
const OBSTACLE_COUNT_MIN = 5;
const OBSTACLE_COUNT_MAX = 7;

/** Mostly long walls; medium ones are even longer (~2× previous ranges). */
const LENGTH_SHORT = { min: 0.3, max: 0.44 };
const LENGTH_MED = { min: 0.48, max: 0.64 };

const THICKNESS = 0.028;

/**
 * Minimum gap between obstacle *surfaces* so a player token can walk through.
 * Matches movementRuntime PLAYER_RADIUS_NORM (~0.045) plus a small comfort margin.
 */
const PLAYER_RADIUS_FOR_GAP = 0.045;
const PASSAGE_MARGIN = 0.03;
/** Minimum distance between thick-wall centerlines. */
const MIN_OBSTACLE_SPINE_GAP =
  THICKNESS + 2 * PLAYER_RADIUS_FOR_GAP + PASSAGE_MARGIN; // ~0.148


/** Keep clear of the usual spawn ring around the center. */
const SPAWN_CLEAR_R = 0.22;
const EDGE_PAD = 0.08;

const OBSTACLE_COLORS = [
  '#E8A838',
  '#3DDC97',
  '#FF6B9D',
  '#7B61FF',
  '#45B7D1',
  '#FF8C42',
  '#F4D35E',
  '#9B5DE5',
  '#00BBF9',
  '#F15BB5',
  '#FEE440',
  '#00F5D4',
];

const KINDS: ObstacleKind[] = ['straight', 'curve', 'corner_sharp', 'corner_round'];

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function pickLength(): number {
  return Math.random() < 0.65
    ? rand(LENGTH_SHORT.min, LENGTH_SHORT.max)
    : rand(LENGTH_MED.min, LENGTH_MED.max);
}

function clamp01(v: number, pad = EDGE_PAD): number {
  return Math.min(1 - pad, Math.max(pad, v));
}

function dist(a: ArenaPoint, b: ArenaPoint): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function rotate(p: ArenaPoint, origin: ArenaPoint, angle: number): ArenaPoint {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return { x: origin.x + dx * c - dy * s, y: origin.y + dx * s + dy * c };
}

function pointInBounds(p: ArenaPoint): boolean {
  return (
    p.x >= EDGE_PAD &&
    p.x <= 1 - EDGE_PAD &&
    p.y >= EDGE_PAD &&
    p.y <= 1 - EDGE_PAD
  );
}

function nearSpawnRing(p: ArenaPoint): boolean {
  return dist(p, { x: 0.5, y: 0.5 }) < SPAWN_CLEAR_R;
}

/** Build a candidate obstacle of the given kind around a center point. */
function buildObstacle(
  kind: ObstacleKind,
  center: ArenaPoint,
  angle: number,
  length: number,
  color: string,
  id: string,
): ArenaObstacle | null {
  const half = length / 2;
  const thickness = THICKNESS;

  if (kind === 'straight') {
    const a = rotate({ x: center.x - half, y: center.y }, center, angle);
    const b = rotate({ x: center.x + half, y: center.y }, center, angle);
    if (!pointInBounds(a) || !pointInBounds(b)) return null;
    if (nearSpawnRing(a) || nearSpawnRing(b) || nearSpawnRing(center)) return null;
    return { id, kind, color, thickness, points: [a, b] };
  }

  if (kind === 'curve') {
    const a = rotate({ x: center.x - half, y: center.y }, center, angle);
    const b = rotate({ x: center.x + half, y: center.y }, center, angle);
    const bend = length * rand(0.25, 0.45) * (Math.random() < 0.5 ? 1 : -1);
    const ctrl = rotate({ x: center.x, y: center.y + bend }, center, angle);
    if (!pointInBounds(a) || !pointInBounds(b) || !pointInBounds(ctrl)) return null;
    if (nearSpawnRing(a) || nearSpawnRing(b) || nearSpawnRing(ctrl)) return null;
    return { id, kind, color, thickness, points: [a, ctrl, b] };
  }

  // L-shaped corner (sharp or round) — two legs of ~length/2.
  const leg = length * 0.55;
  const corner = { ...center };
  const start = rotate({ x: center.x - leg, y: center.y }, center, angle);
  const end = rotate({ x: center.x, y: center.y + leg }, center, angle);
  if (!pointInBounds(start) || !pointInBounds(end) || !pointInBounds(corner)) return null;
  if (nearSpawnRing(start) || nearSpawnRing(end) || nearSpawnRing(corner)) return null;
  return {
    id,
    kind,
    color,
    thickness,
    points: [start, corner, end],
  };
}

function sampleQuadratic(a: ArenaPoint, c: ArenaPoint, b: ArenaPoint, steps: number): ArenaPoint[] {
  const out: ArenaPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const u = 1 - t;
    out.push({
      x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
    });
  }
  return out;
}

function sampleQuarterArc(start: ArenaPoint, corner: ArenaPoint, end: ArenaPoint, steps: number): ArenaPoint[] {
  // Approximate rounded corner: line to near-corner, then quadratic bend, then line out.
  const inset = 0.35;
  const p1 = {
    x: start.x + (corner.x - start.x) * (1 - inset),
    y: start.y + (corner.y - start.y) * (1 - inset),
  };
  const p2 = {
    x: end.x + (corner.x - end.x) * (1 - inset),
    y: end.y + (corner.y - end.y) * (1 - inset),
  };
  return [
    start,
    ...sampleQuadratic(p1, corner, p2, steps).slice(1, -1),
    end,
  ];
}

/** Flatten an obstacle into thick wall segments for physics / LoS. */
export function obstacleToSegments(obstacle: ArenaObstacle): WallSegment[] {
  const { kind, points, thickness } = obstacle;
  const segs: WallSegment[] = [];

  const pushChain = (chain: ArenaPoint[]) => {
    for (let i = 0; i < chain.length - 1; i++) {
      const a = chain[i]!;
      const b = chain[i + 1]!;
      segs.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y, thickness });
    }
  };

  if (kind === 'straight' && points.length >= 2) {
    pushChain([points[0]!, points[1]!]);
    return segs;
  }

  if (kind === 'curve' && points.length >= 3) {
    pushChain(sampleQuadratic(points[0]!, points[1]!, points[2]!, 8));
    return segs;
  }

  if (kind === 'corner_sharp' && points.length >= 3) {
    pushChain([points[0]!, points[1]!, points[2]!]);
    return segs;
  }

  if (kind === 'corner_round' && points.length >= 3) {
    pushChain(sampleQuarterArc(points[0]!, points[1]!, points[2]!, 8));
    return segs;
  }

  return segs;
}

export function obstaclesToSegments(obstacles: ArenaObstacle[]): WallSegment[] {
  return obstacles.flatMap(obstacleToSegments);
}

function closestPointOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { x: number; y: number; t: number } {
  const abx = bx - ax;
  const aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1e-12) return { x: ax, y: ay, t: 0 };
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lenSq));
  return { x: ax + abx * t, y: ay + aby * t, t };
}

/** Push a circle (player token) out of thick wall segments. Returns new position. */
export function resolveCircleAgainstWalls(
  x: number,
  y: number,
  radius: number,
  walls: WallSegment[],
): ArenaPoint {
  let px = x;
  let py = y;

  for (let pass = 0; pass < 3; pass++) {
    for (const w of walls) {
      const closest = closestPointOnSegment(px, py, w.ax, w.ay, w.bx, w.by);
      const dx = px - closest.x;
      const dy = py - closest.y;
      let dist = Math.hypot(dx, dy);
      const minDist = radius + w.thickness * 0.5;
      if (dist >= minDist) continue;

      if (dist < 1e-6) {
        // Degenerate: push along segment normal.
        const sx = w.bx - w.ax;
        const sy = w.by - w.ay;
        const len = Math.hypot(sx, sy) || 1;
        px += (-sy / len) * minDist;
        py += (sx / len) * minDist;
        continue;
      }

      const push = (minDist - dist) / dist;
      px += dx * push;
      py += dy * push;
    }
  }

  return { x: px, y: py };
}

/** True when a circle does not overlap any wall (with a small clearance margin). */
export function isCircleClearOfWalls(
  x: number,
  y: number,
  radius: number,
  walls: WallSegment[],
  margin = 0.012,
): boolean {
  const minDist = radius + margin;
  for (const w of walls) {
    const closest = closestPointOnSegment(x, y, w.ax, w.ay, w.bx, w.by);
    const dist = Math.hypot(x - closest.x, y - closest.y);
    if (dist < minDist + w.thickness * 0.5) return false;
  }
  return true;
}

/** True when a circle is overlapping / pressing into a wall segment. */
export function circleTouchesWalls(
  x: number,
  y: number,
  radius: number,
  walls: WallSegment[],
  margin = 0.002,
): boolean {
  return !isCircleClearOfWalls(x, y, radius, walls, margin);
}

function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (by - ay) * (cx - bx) - (bx - ax) * (cy - by);
}

function onSegment(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): boolean {
  return (
    Math.min(ax, bx) - 1e-9 <= cx &&
    cx <= Math.max(ax, bx) + 1e-9 &&
    Math.min(ay, by) - 1e-9 <= cy &&
    cy <= Math.max(ay, by) + 1e-9
  );
}

/** True if thin segments AB and CD properly intersect. */
function segmentsIntersect(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  const o1 = orient(ax, ay, bx, by, cx, cy);
  const o2 = orient(ax, ay, bx, by, dx, dy);
  const o3 = orient(cx, cy, dx, dy, ax, ay);
  const o4 = orient(cx, cy, dx, dy, bx, by);

  if (o1 * o2 < 0 && o3 * o4 < 0) return true;
  if (Math.abs(o1) < 1e-9 && onSegment(ax, ay, bx, by, cx, cy)) return true;
  if (Math.abs(o2) < 1e-9 && onSegment(ax, ay, bx, by, dx, dy)) return true;
  if (Math.abs(o3) < 1e-9 && onSegment(cx, cy, dx, dy, ax, ay)) return true;
  if (Math.abs(o4) < 1e-9 && onSegment(cx, cy, dx, dy, bx, by)) return true;
  return false;
}

/**
 * Line of sight: the segment from A to B must not cross any thick wall.
 * Approximates thickness by testing the centerline against expanded walls
 * (circle-swept: if closest approach of ray to wall spine < thickness/2, blocked).
 */
export function hasLineOfSight(
  from: ArenaPoint,
  to: ArenaPoint,
  walls: WallSegment[],
): boolean {
  for (const w of walls) {
    // Centerline cross?
    if (segmentsIntersect(from.x, from.y, to.x, to.y, w.ax, w.ay, w.bx, w.by)) {
      return false;
    }

    // Thick wall: sample closest approach of the sight segment to the wall spine.
    const samples = 6;
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const sx = from.x + (to.x - from.x) * t;
      const sy = from.y + (to.y - from.y) * t;
      const c = closestPointOnSegment(sx, sy, w.ax, w.ay, w.bx, w.by);
      if (Math.hypot(sx - c.x, sy - c.y) < w.thickness * 0.5) {
        // Ignore if the sample is near the endpoints (inside caster/target token).
        const nearEnd =
          Math.hypot(sx - from.x, sy - from.y) < 0.04 ||
          Math.hypot(sx - to.x, sy - to.y) < 0.04;
        if (!nearEnd) return false;
      }
    }
  }
  return true;
}

/** Closest distance between two finite segments (normalized arena space). */
function segmentSegmentDistance(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): number {
  // If they cross, distance is 0.
  if (segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy)) return 0;

  // Sample denser near endpoints; enough for short party-game walls.
  let min = Infinity;
  const samples = 10;
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const px = ax + (bx - ax) * t;
    const py = ay + (by - ay) * t;
    const c = closestPointOnSegment(px, py, cx, cy, dx, dy);
    min = Math.min(min, Math.hypot(px - c.x, py - c.y));
  }
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const px = cx + (dx - cx) * t;
    const py = cy + (dy - cy) * t;
    const c = closestPointOnSegment(px, py, ax, ay, bx, by);
    min = Math.min(min, Math.hypot(px - c.x, py - c.y));
  }
  return min;
}

/**
 * True when two obstacles leave less than a player-width passage between them
 * (or their thick walls overlap).
 */
function obstaclesTooClose(a: ArenaObstacle, b: ArenaObstacle): boolean {
  const sa = obstacleToSegments(a);
  const sb = obstacleToSegments(b);
  for (const wa of sa) {
    for (const wb of sb) {
      const spineDist = segmentSegmentDistance(
        wa.ax,
        wa.ay,
        wa.bx,
        wa.by,
        wb.ax,
        wb.ay,
        wb.bx,
        wb.by,
      );
      // Spine distance must leave room for both half-thicknesses + a player.
      if (spineDist < MIN_OBSTACLE_SPINE_GAP) return true;
    }
  }
  return false;
}

/** SVG path `d` for an obstacle in viewBox 0 0 1 1. */
export function obstacleSvgPath(obstacle: ArenaObstacle): string {
  const { kind, points } = obstacle;
  if (kind === 'straight' && points.length >= 2) {
    const [a, b] = points;
    return `M ${a!.x} ${a!.y} L ${b!.x} ${b!.y}`;
  }
  if (kind === 'curve' && points.length >= 3) {
    const [a, c, b] = points;
    return `M ${a!.x} ${a!.y} Q ${c!.x} ${c!.y} ${b!.x} ${b!.y}`;
  }
  if (kind === 'corner_sharp' && points.length >= 3) {
    const [a, c, b] = points;
    return `M ${a!.x} ${a!.y} L ${c!.x} ${c!.y} L ${b!.x} ${b!.y}`;
  }
  if (kind === 'corner_round' && points.length >= 3) {
    const [a, c, b] = points;
    const inset = 0.35;
    const p1 = {
      x: a!.x + (c!.x - a!.x) * (1 - inset),
      y: a!.y + (c!.y - a!.y) * (1 - inset),
    };
    const p2 = {
      x: b!.x + (c!.x - b!.x) * (1 - inset),
      y: b!.y + (c!.y - b!.y) * (1 - inset),
    };
    return `M ${a!.x} ${a!.y} L ${p1.x} ${p1.y} Q ${c!.x} ${c!.y} ${p2.x} ${p2.y} L ${b!.x} ${b!.y}`;
  }
  return '';
}

/**
 * Generate a fresh set of colorful obstacles for a round.
 * Avoids the center spawn ring and keeps walkable gaps between walls.
 */
export function generateRoundObstacles(): ArenaObstacle[] {
  const count =
    OBSTACLE_COUNT_MIN +
    Math.floor(Math.random() * (OBSTACLE_COUNT_MAX - OBSTACLE_COUNT_MIN + 1));

  const colors = [...OBSTACLE_COLORS].sort(() => Math.random() - 0.5);
  const result: ArenaObstacle[] = [];
  let attempts = 0;
  // Longer walls + strict spine-gap need more placement tries.
  const maxAttempts = count * 250;

  while (result.length < count && attempts < maxAttempts) {
    attempts += 1;
    const kind = KINDS[Math.floor(Math.random() * KINDS.length)]!;
    const color = colors[result.length % colors.length]!;
    const length = pickLength();
    const angle = rand(0, Math.PI * 2);

    // Prefer mid-ring placements (not center, not extreme edge).
    const ring = rand(0.26, 0.46);
    const theta = rand(0, Math.PI * 2);
    const center = {
      x: clamp01(0.5 + Math.cos(theta) * ring),
      y: clamp01(0.5 + Math.sin(theta) * ring),
    };

    const candidate = buildObstacle(
      kind,
      center,
      angle,
      length,
      color,
      `obs_${result.length}_${attempts}`,
    );
    if (!candidate) continue;
    if (result.some((o) => obstaclesTooClose(o, candidate))) continue;
    result.push(candidate);
  }

  return result;
}
