export const WS_URL = import.meta.env.VITE_WS_URL ?? 'ws://localhost:3001/ws';
export const JOIN_BASE_URL = import.meta.env.VITE_JOIN_BASE_URL ?? 'http://localhost:5173/join';

export const CHARACTER_COLORS = [
  '#FF5733',
  '#33FF57',
  '#3357FF',
  '#FF33F5',
  '#F5FF33',
  '#33FFF5',
  '#FF8C33',
  '#8C33FF',
] as const;

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
