import type { ConnectionRole, RoomStatus, PlayerInfo } from '@chaos-parcel/shared';
import type { WebSocket } from 'ws';

export interface PlayerConnection {
  playerId: string;
  socket: WebSocket;
  nickname: string;
  characterColor: string;
  avatar?: string;
  lastMoveAt: number;
}

export interface RoomState {
  roomCode: string;
  hostSocket: WebSocket;
  hostVersion: string;
  players: Map<string, PlayerConnection>;
  status: RoomStatus;
  createdAt: Date;
}

export interface ClientMeta {
  role: ConnectionRole;
  roomCode?: string;
  playerId?: string;
}

export function playerToInfo(player: PlayerConnection): PlayerInfo {
  return {
    player_id: player.playerId,
    nickname: player.nickname,
    character_color: player.characterColor,
    ...(player.avatar ? { avatar: player.avatar } : {}),
  };
}
