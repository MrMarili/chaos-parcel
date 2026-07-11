import type { IncomingClientMessage } from '@chaos-parcel/shared';
import type { WebSocket } from 'ws';
import type { RoomManager } from '../roomManager.js';
import type { ClientMeta } from '../types.js';
import { playerToInfo } from '../types.js';
import { validateIncomingMessage } from '../validate.js';
import { upsertDeviceProfile } from '../deviceProfileStore.js';

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

    if (message.event === 'PLAYER_REJOIN') {
      handlePlayerRejoin(roomManager, socket, meta, message);
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
  const { room_code, nickname, avatar, cosmetics, character_color, device_id } =
    message.payload;
  const result = roomManager.joinPlayer(
    socket,
    room_code,
    nickname,
    avatar,
    cosmetics,
    character_color,
  );

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
  meta.disconnectHandled = false;

  if (device_id) {
    const room = roomManager.getRoom(room_code);
    const player = room?.players.get(result.playerId);
    upsertDeviceProfile(device_id, {
      nickname,
      updatedAt: Date.now(),
      ...(player?.characterColor ? { characterColor: player.characterColor } : {}),
      ...(avatar ? { avatar } : {}),
      ...(cosmetics?.length ? { cosmetics } : {}),
    });
  }
}

function handlePlayerRejoin(
  roomManager: RoomManager,
  socket: WebSocket,
  meta: ClientMeta,
  message: Extract<ReturnType<typeof validateIncomingMessage>, { event: 'PLAYER_REJOIN' }>,
): void {
  const { room_code, player_id } = message.payload;
  const result = roomManager.rejoinPlayer(socket, room_code, player_id);

  if ('error' in result) {
    const errorMessages: Record<string, string> = {
      ROOM_NOT_FOUND: 'החדר כבר לא פעיל. סרוק שוב את ה-QR.',
      ROOM_FINISHED: 'המשחק הזה כבר הסתיים.',
      PLAYER_NOT_FOUND: 'המושב שלך בחדר פג. הצטרף מחדש.',
      REJOIN_EXPIRED: 'עבר יותר מדי זמן — הצטרף מחדש לחדר.',
    };
    roomManager.sendError(
      socket,
      result.error,
      errorMessages[result.error] ?? 'Unable to rejoin room.',
    );
    return;
  }

  meta.role = 'player';
  meta.roomCode = room_code.toUpperCase();
  meta.playerId = result.playerId;
  meta.disconnectHandled = false;

  const player = result.room.players.get(result.playerId)!;
  roomManager.broadcastToRoom(result.room, {
    event: 'PLAYER_JOINED',
    payload: {
      room_code: result.room.roomCode,
      player: playerToInfo(player),
      players: roomManager.buildPlayerList(result.room),
    },
  });
}

export function handleHostRoomCreate(
  roomManager: RoomManager,
  socket: WebSocket,
  meta: ClientMeta,
  hostVersion: string,
  joinBaseUrl: string,
  options?: { hasPass?: boolean },
): string {
  const roomCode = roomManager.createRoom(socket, hostVersion, {
    hasPass: options?.hasPass === true,
  });
  meta.role = 'host';
  meta.roomCode = roomCode;
  meta.disconnectHandled = false;

  const room = roomManager.getRoom(roomCode)!;
  const joinUrl = `${joinBaseUrl.replace(/\/$/, '')}/${roomCode}`;
  roomManager.send(socket, {
    event: 'ROOM_CREATED',
    payload: {
      room_code: roomCode,
      join_url: joinUrl,
      has_pass: room.hasPass,
      ads_enabled: room.adsEnabled,
    },
  });

  return roomCode;
}

export function handleDisconnect(
  roomManager: RoomManager,
  meta: ClientMeta,
  socket: WebSocket,
): void {
  if (meta.disconnectHandled) return;
  meta.disconnectHandled = true;

  if (!meta.roomCode) return;

  if (meta.role === 'host') {
    roomManager.handleHostDisconnect(meta.roomCode);
    return;
  }

  if (meta.playerId) {
    // Soft leave — seat stays until grace expires or player rejoins.
    // Pass the closing socket so a delayed close after rejoin is ignored.
    roomManager.markPlayerDisconnected(meta.roomCode, meta.playerId, socket);
  }
}
