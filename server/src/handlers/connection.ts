import type { IncomingClientMessage } from '@chaos-parcel/shared';
import type { WebSocket } from 'ws';
import type { RoomManager } from '../roomManager.js';
import type { ClientMeta } from '../types.js';
import { validateIncomingMessage } from '../validate.js';

export function handleConnectionMessage(
  roomManager: RoomManager,
  socket: WebSocket,
  meta: ClientMeta,
  raw: string,
): void {
  try {
    const message = validateIncomingMessage(raw, meta.role);

    if (meta.role === 'host') {
      roomManager.handleHostMessage(meta, message as Parameters<RoomManager['handleHostMessage']>[1]);
      return;
    }

    if (message.event === 'PLAYER_JOIN') {
      handlePlayerJoin(roomManager, socket, meta, message);
      return;
    }

    if (!meta.roomCode || !meta.playerId) {
      roomManager.sendError(socket, 'NOT_JOINED', 'Join a room before sending game input.');
      return;
    }

    roomManager.handleClientMessage(meta, message as IncomingClientMessage);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid message';
    roomManager.sendError(socket, 'INVALID_MESSAGE', message);
  }
}

function handlePlayerJoin(
  roomManager: RoomManager,
  socket: WebSocket,
  meta: ClientMeta,
  message: Extract<ReturnType<typeof validateIncomingMessage>, { event: 'PLAYER_JOIN' }>,
): void {
  const { room_code, nickname, character_color, avatar } = message.payload;
  const result = roomManager.joinPlayer(socket, room_code, nickname, character_color, avatar);

  if ('error' in result) {
    const errorMessages: Record<string, string> = {
      ROOM_NOT_FOUND: 'חדר לא נמצא. ודא שמסך המארח (/host) פתוח ומחובר.',
      ROOM_FULL: 'החדר מלא.',
      ROOM_FINISHED: 'המשחק הזה כבר הסתיים.',
    };
    roomManager.sendError(
      socket,
      result.error,
      errorMessages[result.error] ?? 'Unable to join room.',
    );
    return;
  }

  meta.role = 'player';
  meta.roomCode = room_code.toUpperCase();
  meta.playerId = result.playerId;
}

export function handleHostRoomCreate(
  roomManager: RoomManager,
  socket: WebSocket,
  meta: ClientMeta,
  hostVersion: string,
  joinBaseUrl: string,
): string {
  const roomCode = roomManager.createRoom(socket, hostVersion);
  meta.role = 'host';
  meta.roomCode = roomCode;

  const joinUrl = `${joinBaseUrl.replace(/\/$/, '')}/${roomCode}`;
  roomManager.send(socket, {
    event: 'ROOM_CREATED',
    payload: { room_code: roomCode, join_url: joinUrl },
  });

  return roomCode;
}

export function handleDisconnect(
  roomManager: RoomManager,
  meta: ClientMeta,
): void {
  if (!meta.roomCode) return;

  if (meta.role === 'host') {
    roomManager.handleHostDisconnect(meta.roomCode);
    return;
  }

  if (meta.playerId) {
    const room = roomManager.removePlayer(meta.roomCode, meta.playerId);
    if (room && room.players.size >= 0) {
      roomManager.broadcastToRoom(room, {
        event: 'PLAYER_LEFT',
        payload: {
          room_code: meta.roomCode,
          player_id: meta.playerId,
          players: roomManager.buildPlayerList(room),
        },
      });
    }
  }
}
