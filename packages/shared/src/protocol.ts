import { z } from 'zod';
import { ABILITY_TYPES, ROOM_STATUSES } from './constants.js';
import { COSMETIC_CATALOG } from './monetization.js';

const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const normalizedAxis = z.number().min(-1).max(1);
const playerId = z.string().min(1).max(64);
const roomCode = z.string().length(4);
const cosmeticId = z
  .string()
  .min(1)
  .max(64)
  .refine((id) => COSMETIC_CATALOG.some((c) => c.id === id), {
    message: 'Unknown cosmetic id',
  });

// Compressed avatar as a data URL (JPEG/PNG/WebP). Capped to keep WS messages small.
export const MAX_AVATAR_LENGTH = 60_000;
const avatarDataUrl = z
  .string()
  .max(MAX_AVATAR_LENGTH)
  .regex(/^data:image\/(png|jpeg|webp);base64,/);

// --- Client / Host → Server ---

export const roomCreatePayloadSchema = z.object({
  host_version: z.string().min(1).max(32),
  /** Browser origin of the host (e.g. http://192.168.1.5:5173) — used for QR join links on LAN. */
  client_base_url: z.string().url().optional(),
  /** Signed Party Pass token from Stripe / local unlock — enables ad-free room. */
  party_pass_token: z.string().min(1).max(2048).optional(),
});

export const playerJoinPayloadSchema = z.object({
  room_code: roomCode,
  nickname: z.string().min(1).max(50).trim(),
  /**
   * Preferred arena color from a previous join.
   * Server reuses it when still distinct from other players in the room.
   */
  character_color: hexColor.optional(),
  avatar: avatarDataUrl.optional(),
  /** Equipped cosmetics (must be owned client-side; server only validates catalog ids). */
  cosmetics: z.array(cosmeticId).max(8).optional(),
  /** Stable browser device key for remembering join defaults across parties. */
  device_id: z
    .string()
    .min(8)
    .max(64)
    .regex(/^dev_[a-zA-Z0-9]+$/)
    .optional(),
});

/** Resume an existing seat after a brief disconnect (phone lock / background). */
export const playerRejoinPayloadSchema = z.object({
  room_code: roomCode,
  player_id: playerId,
});

export const playerMovePayloadSchema = z.object({
  player_id: playerId,
  x: normalizedAxis,
  y: normalizedAxis,
});

export const abilityTriggerPayloadSchema = z.object({
  player_id: playerId,
  ability_type: z.enum(ABILITY_TYPES),
  target_player_id: playerId.optional(),
});

export const passPackagePayloadSchema = z.object({
  player_id: playerId,
  target_player_id: playerId.optional(),
});

// --- Host → Server (broadcast to clients) ---

export const playerInfoSchema = z.object({
  player_id: playerId,
  nickname: z.string(),
  character_color: hexColor,
  avatar: avatarDataUrl.optional(),
  is_host: z.boolean().optional(),
  cosmetics: z.array(cosmeticId).max(8).optional(),
});

export const cooldownStateSchema = z.object({
  FREEZE: z.number().min(0),
  SHOCKWAVE: z.number().min(0),
  MAGNET: z.number().min(0),
  CONFUSION: z.number().min(0),
});

export const gameStatePayloadSchema = z.object({
  room_code: roomCode,
  status: z.enum(ROOM_STATUSES),
  round: z.number().int().min(0).max(5),
  package_holder_id: playerId.nullable(),
  timer_seconds: z.number().min(0).optional(),
  /** True when the package holder is close enough to pass to another player. */
  can_pass: z.boolean().optional(),
  players: z.array(playerInfoSchema),
  cooldowns: z.record(playerId, cooldownStateSchema).optional(),
  /** Host Party Pass active for this room — ads off for everyone. */
  has_pass: z.boolean().optional(),
  /** Soft ads allowed in downtime slots (false when has_pass). */
  ads_enabled: z.boolean().optional(),
});

export const roundEndPayloadSchema = z.object({
  room_code: roomCode,
  round: z.number().int().min(1).max(5),
  scores: z.array(
    z.object({
      player_id: playerId,
      nickname: z.string(),
      character_color: hexColor,
      avatar: avatarDataUrl.optional(),
      round_score: z.number().int(),
      total_score: z.number().int(),
      survived: z.boolean(),
      had_explosion: z.boolean(),
      explosion_count: z.number().int().min(0).optional(),
    }),
  ),
});

export const packageExplodedPayloadSchema = z.object({
  room_code: roomCode,
  exploded_player_id: playerId,
  exploded_nickname: z.string(),
  new_holder_id: playerId.nullable(),
  new_holder_nickname: z.string().optional(),
});

export const gameEndPayloadSchema = z.object({
  room_code: roomCode,
  final_scores: z.array(
    z.object({
      player_id: playerId,
      nickname: z.string(),
      total_score: z.number().int(),
      rank: z.number().int().min(1),
      stats: z.object({
        abilities_received: z.number().int().min(0).optional(),
        bombs_exploded: z.number().int().min(0).optional(),
        time_without_package_seconds: z.number().min(0).optional(),
      }).optional(),
    }),
  ),
  fun_facts: z.record(playerId, z.string()).optional(),
});

export const hostStartPayloadSchema = z.object({
  room_code: roomCode,
});

// --- Server → Client / Host ---

export const roomCreatedPayloadSchema = z.object({
  room_code: roomCode,
  join_url: z.string().url(),
  has_pass: z.boolean(),
  ads_enabled: z.boolean(),
});

export const playerJoinedPayloadSchema = z.object({
  room_code: roomCode,
  player: playerInfoSchema,
  players: z.array(playerInfoSchema),
});

export const playerLeftPayloadSchema = z.object({
  room_code: roomCode,
  player_id: playerId,
  players: z.array(playerInfoSchema),
});

export const errorPayloadSchema = z.object({
  code: z.string(),
  message: z.string(),
});

export const hostDisconnectedPayloadSchema = z.object({
  room_code: roomCode,
  message: z.string(),
});

// --- Discriminated union of all events ---

const clientToServerEvents = [
  z.object({ event: z.literal('ROOM_CREATE'), payload: roomCreatePayloadSchema }),
  z.object({ event: z.literal('PLAYER_JOIN'), payload: playerJoinPayloadSchema }),
  z.object({ event: z.literal('PLAYER_REJOIN'), payload: playerRejoinPayloadSchema }),
  z.object({ event: z.literal('PLAYER_MOVE'), payload: playerMovePayloadSchema }),
  z.object({ event: z.literal('ABILITY_TRIGGER'), payload: abilityTriggerPayloadSchema }),
  z.object({ event: z.literal('PASS_PACKAGE'), payload: passPackagePayloadSchema }),
] as const;

const hostToServerEvents = [
  z.object({ event: z.literal('HOST_START'), payload: hostStartPayloadSchema }),
  z.object({ event: z.literal('GAME_STATE'), payload: gameStatePayloadSchema }),
  z.object({ event: z.literal('ROUND_END'), payload: roundEndPayloadSchema }),
  z.object({ event: z.literal('GAME_END'), payload: gameEndPayloadSchema }),
  z.object({ event: z.literal('PACKAGE_EXPLODED'), payload: packageExplodedPayloadSchema }),
] as const;

const serverToClientEvents = [
  z.object({ event: z.literal('ROOM_CREATED'), payload: roomCreatedPayloadSchema }),
  z.object({ event: z.literal('PLAYER_JOINED'), payload: playerJoinedPayloadSchema }),
  z.object({ event: z.literal('PLAYER_LEFT'), payload: playerLeftPayloadSchema }),
  z.object({ event: z.literal('GAME_STATE'), payload: gameStatePayloadSchema }),
  z.object({ event: z.literal('ROUND_END'), payload: roundEndPayloadSchema }),
  z.object({ event: z.literal('GAME_END'), payload: gameEndPayloadSchema }),
  z.object({ event: z.literal('PACKAGE_EXPLODED'), payload: packageExplodedPayloadSchema }),
  z.object({ event: z.literal('HOST_DISCONNECTED'), payload: hostDisconnectedPayloadSchema }),
  z.object({ event: z.literal('ERROR'), payload: errorPayloadSchema }),
] as const;

export const incomingClientMessageSchema = z.discriminatedUnion('event', [
  ...clientToServerEvents,
]);

export const incomingHostMessageSchema = z.discriminatedUnion('event', [
  ...hostToServerEvents,
  z.object({ event: z.literal('ROOM_CREATE'), payload: roomCreatePayloadSchema }),
]);

export const outgoingMessageSchema = z.discriminatedUnion('event', [
  ...serverToClientEvents,
  z.object({ event: z.literal('PLAYER_MOVE'), payload: playerMovePayloadSchema }),
  z.object({ event: z.literal('ABILITY_TRIGGER'), payload: abilityTriggerPayloadSchema }),
  z.object({ event: z.literal('PASS_PACKAGE'), payload: passPackagePayloadSchema }),
  z.object({ event: z.literal('HOST_START'), payload: hostStartPayloadSchema }),
]);

export type RoomCreatePayload = z.infer<typeof roomCreatePayloadSchema>;
export type PlayerJoinPayload = z.infer<typeof playerJoinPayloadSchema>;
export type PlayerRejoinPayload = z.infer<typeof playerRejoinPayloadSchema>;
export type PlayerMovePayload = z.infer<typeof playerMovePayloadSchema>;
export type AbilityTriggerPayload = z.infer<typeof abilityTriggerPayloadSchema>;
export type PassPackagePayload = z.infer<typeof passPackagePayloadSchema>;
export type GameStatePayload = z.infer<typeof gameStatePayloadSchema>;
export type RoundEndPayload = z.infer<typeof roundEndPayloadSchema>;
export type PackageExplodedPayload = z.infer<typeof packageExplodedPayloadSchema>;
export type GameEndPayload = z.infer<typeof gameEndPayloadSchema>;
export type RoomCreatedPayload = z.infer<typeof roomCreatedPayloadSchema>;
export type PlayerJoinedPayload = z.infer<typeof playerJoinedPayloadSchema>;
export type PlayerInfo = z.infer<typeof playerInfoSchema>;
export type CooldownState = z.infer<typeof cooldownStateSchema>;

export type IncomingClientMessage = z.infer<typeof incomingClientMessageSchema>;
export type IncomingHostMessage = z.infer<typeof incomingHostMessageSchema>;
export type OutgoingMessage = z.infer<typeof outgoingMessageSchema>;

export type WsMessage =
  | IncomingClientMessage
  | IncomingHostMessage
  | OutgoingMessage;

export function parseIncomingMessage(
  data: unknown,
  role: 'host' | 'player',
): WsMessage {
  if (role === 'host') {
    return incomingHostMessageSchema.parse(data);
  }
  return incomingClientMessageSchema.parse(data);
}

export function serializeMessage(message: WsMessage): string {
  return JSON.stringify(message);
}

export function parseRawMessage(raw: string): unknown {
  return JSON.parse(raw) as unknown;
}
