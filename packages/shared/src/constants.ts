/** Readable room code alphabet — excludes O/0/I/1 */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 4;

export const ABILITY_TYPES = ['FREEZE', 'SHOCKWAVE', 'MAGNET', 'CONFUSION'] as const;
export type AbilityType = (typeof ABILITY_TYPES)[number];

export const ROOM_STATUSES = ['LOBBY', 'IN_GAME', 'FINISHED'] as const;
export type RoomStatus = (typeof ROOM_STATUSES)[number];

export const CONNECTION_ROLES = ['host', 'player'] as const;
export type ConnectionRole = (typeof CONNECTION_ROLES)[number];

export const MOVE_THROTTLE_MS = 22; // ~45Hz
export const MAX_PLAYERS_PER_ROOM = 8;
