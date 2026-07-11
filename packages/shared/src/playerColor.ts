/** Minimum Euclidean RGB distance so tokens stay visually distinct on the arena. */
export const MIN_PLAYER_COLOR_DISTANCE = 95;

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const light = l / 100;
  const c = (1 - Math.abs(2 * light - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = light - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const toHex = (v: number) => clampByte((v + m) * 255).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

export function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '');
  const full =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized;
  const n = Number.parseInt(full, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Euclidean distance in RGB space (0–~441). */
export function colorDistance(a: string, b: string): number {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return Math.hypot(ar - br, ag - bg, ab - bb);
}

function randomVibrantHex(): string {
  const h = Math.random() * 360;
  const s = 70 + Math.random() * 25; // 70–95%
  const l = 42 + Math.random() * 18; // 42–60% — readable on dark arena
  return hslToHex(h, s, l);
}

/**
 * Pick a vibrant hex color that is not identical or very close
 * to any color already used in the room.
 * When `preferred` is free enough, reuse it so returning players keep their look.
 */
export function pickDistinctColor(
  existingColors: string[],
  minDistance = MIN_PLAYER_COLOR_DISTANCE,
  maxAttempts = 100,
  preferred?: string,
): string {
  const existing = existingColors.map((c) => c.toUpperCase());

  if (preferred && /^#[0-9A-Fa-f]{6}$/.test(preferred)) {
    const candidate = preferred.toUpperCase();
    if (existing.every((c) => colorDistance(candidate, c) >= minDistance)) {
      return candidate;
    }
  }

  for (let i = 0; i < maxAttempts; i++) {
    const candidate = randomVibrantHex();
    if (existing.every((c) => colorDistance(candidate, c) >= minDistance)) {
      return candidate;
    }
  }

  // Fallback: maximize minimum distance to existing colors.
  let best = randomVibrantHex();
  let bestScore = -1;
  for (let i = 0; i < 40; i++) {
    const candidate = randomVibrantHex();
    const score =
      existing.length === 0
        ? Infinity
        : Math.min(...existing.map((c) => colorDistance(candidate, c)));
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  return best;
}
