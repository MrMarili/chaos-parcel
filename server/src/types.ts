import type { ConnectionRole, RoomStatus, PlayerInfo } from '@chaos-parcel/shared';
import type { WebSocket } from 'ws';

export interface PlayerConnection {
  playerId: string;
  socket: WebSocket;
  nickname: string;
  characterColor: string;
  avatar?: string;
  /** Equipped cosmetic catalog ids. */
  cosmetics?: string[];
  lastMoveAt: number;
  /** Set when the socket drops; cleared on successful rejoin. */
  disconnectedAt?: number;
  /** Timer that finalizes PLAYER_LEFT after the grace window. */
  removeTimer?: ReturnType<typeof setTimeout>;
}

export interface RoomState {
  roomCode: string;
  hostSocket: WebSocket;
  hostVersion: string;
  players: Map<string, PlayerConnection>;
  status: RoomStatus;
  createdAt: Date;
  /** Host Party Pass unlocks ad-free room for all players. */
  hasPass: boolean;
  /** Soft ads in downtime; always false when hasPass. */
  adsEnabled: boolean;
}

export interface ClientMeta {
  role: ConnectionRole;
  roomCode?: string;
  playerId?: string;
  /** Prevents double leave when both `error` and `close` fire. */
  disconnectHandled?: boolean;
}

export function playerToInfo(player: PlayerConnection): PlayerInfo {
  return {
    player_id: player.playerId,
    nickname: player.nickname,
    character_color: player.characterColor,
    ...(player.avatar ? { avatar: player.avatar } : {}),
    ...(player.cosmetics?.length ? { cosmetics: player.cosmetics as PlayerInfo['cosmetics'] } : {}),
  };
}
