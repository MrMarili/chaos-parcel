import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import {
  MAX_PLAYERS_PER_ROOM,
  MOVE_THROTTLE_MS,
  PLAYER_DISCONNECT_GRACE_MS,
  generateRoomCode,
  pickDistinctColor,
  serializeMessage,
  type IncomingClientMessage,
  type IncomingHostMessage,
  type OutgoingMessage,
  type WsMessage,
} from '@chaos-parcel/shared';
import type { ClientMeta, PlayerConnection, RoomState } from './types.js';
import { playerToInfo } from './types.js';

export class RoomManager {
  private rooms = new Map<string, RoomState>();

  createRoom(
    hostSocket: WebSocket,
    hostVersion: string,
    options?: { hasPass?: boolean },
  ): string {
    const existingCodes = new Set(this.rooms.keys());
    const roomCode = generateRoomCode(existingCodes);
    const hasPass = options?.hasPass === true;
    const adsEnabled = !hasPass;

    this.rooms.set(roomCode, {
      roomCode,
      hostSocket,
      hostVersion,
      players: new Map(),
      status: 'LOBBY',
      createdAt: new Date(),
      hasPass,
      adsEnabled,
    });

    return roomCode;
  }

  getRoom(roomCode: string): RoomState | undefined {
    return this.rooms.get(roomCode.toUpperCase());
  }

  deleteRoom(roomCode: string): void {
    const room = this.getRoom(roomCode);
    if (room) {
      for (const player of room.players.values()) {
        if (player.removeTimer) clearTimeout(player.removeTimer);
      }
    }
    this.rooms.delete(roomCode.toUpperCase());
  }

  joinRoom(
    roomCode: string,
    socket: WebSocket,
    nickname: string,
    avatar?: string,
    cosmetics?: string[],
    preferredColor?: string,
  ): { playerId: string; room: RoomState } | { error: string } {
    const room = this.getRoom(roomCode);
    if (!room) {
      return { error: 'ROOM_NOT_FOUND' };
    }
    if (room.status === 'FINISHED') {
      return { error: 'ROOM_FINISHED' };
    }
    if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
      return { error: 'ROOM_FULL' };
    }

    const existingColors = [...room.players.values()].map((p) => p.characterColor);
    const characterColor = pickDistinctColor(
      existingColors,
      undefined,
      undefined,
      preferredColor,
    );

    const playerId = `usr_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    const player: PlayerConnection = {
      playerId,
      socket,
      nickname,
      characterColor,
      avatar,
      ...(cosmetics?.length ? { cosmetics } : {}),
      lastMoveAt: 0,
    };
    room.players.set(playerId, player);

    return { playerId, room };
  }

  /**
   * Soft-disconnect: keep the seat for PLAYER_DISCONNECT_GRACE_MS so a phone
   * lock / app switch can rejoin without losing the player on the host.
   * Only marks if `closingSocket` is still this player's active socket — a
   * delayed close from a superseded connection must not undo a successful rejoin.
   */
  markPlayerDisconnected(
    roomCode: string,
    playerId: string,
    closingSocket?: WebSocket,
  ): void {
    const room = this.getRoom(roomCode);
    if (!room) return;
    const player = room.players.get(playerId);
    if (!player || player.disconnectedAt) return;
    if (closingSocket && player.socket !== closingSocket) return;

    player.disconnectedAt = Date.now();
    if (player.removeTimer) clearTimeout(player.removeTimer);
    player.removeTimer = setTimeout(() => {
      this.finalizePlayerLeave(roomCode, playerId);
    }, PLAYER_DISCONNECT_GRACE_MS);
  }

  /** Hard-remove after grace expires (or explicit leave). */
  finalizePlayerLeave(roomCode: string, playerId: string): RoomState | undefined {
    const room = this.getRoom(roomCode);
    if (!room) return undefined;
    const player = room.players.get(playerId);
    if (!player) return room;
    if (player.removeTimer) {
      clearTimeout(player.removeTimer);
      player.removeTimer = undefined;
    }
    room.players.delete(playerId);
    this.broadcastToRoom(room, {
      event: 'PLAYER_LEFT',
      payload: {
        room_code: room.roomCode,
        player_id: playerId,
        players: this.buildPlayerList(room),
      },
    });
    return room;
  }

  rejoinPlayer(
    socket: WebSocket,
    roomCode: string,
    playerId: string,
  ): { playerId: string; room: RoomState } | { error: string } {
    const room = this.getRoom(roomCode);
    if (!room) return { error: 'ROOM_NOT_FOUND' };
    if (room.status === 'FINISHED') return { error: 'ROOM_FINISHED' };

    const player = room.players.get(playerId);
    if (!player) return { error: 'PLAYER_NOT_FOUND' };

    if (
      player.disconnectedAt &&
      Date.now() - player.disconnectedAt > PLAYER_DISCONNECT_GRACE_MS
    ) {
      this.finalizePlayerLeave(roomCode, playerId);
      return { error: 'REJOIN_EXPIRED' };
    }

    if (player.removeTimer) {
      clearTimeout(player.removeTimer);
      player.removeTimer = undefined;
    }
    player.disconnectedAt = undefined;
    player.socket = socket;

    return { playerId, room };
  }

  removePlayer(roomCode: string, playerId: string): RoomState | undefined {
    const room = this.getRoom(roomCode);
    if (!room) return undefined;
    const player = room.players.get(playerId);
    if (player?.removeTimer) clearTimeout(player.removeTimer);
    room.players.delete(playerId);
    return room;
  }

  handleHostDisconnect(roomCode: string): RoomState | undefined {
    const room = this.getRoom(roomCode);
    if (!room) return undefined;
    this.broadcastToPlayers(room, {
      event: 'HOST_DISCONNECTED',
      payload: {
        room_code: roomCode,
        message: 'Host disconnected. Please wait for a new game.',
      },
    });
    this.deleteRoom(roomCode);
    return room;
  }

  setRoomStatus(roomCode: string, status: RoomState['status']): void {
    const room = this.getRoom(roomCode);
    if (room) {
      room.status = status;
    }
  }

  shouldThrottleMove(
    player: PlayerConnection,
    dx = 0,
    dy = 0,
  ): boolean {
    // Never drop stop packets — otherwise the host keeps the last velocity.
    if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) {
      player.lastMoveAt = Date.now();
      return false;
    }
    const now = Date.now();
    if (now - player.lastMoveAt < MOVE_THROTTLE_MS) {
      return true;
    }
    player.lastMoveAt = now;
    return false;
  }

  send(socket: WebSocket, message: OutgoingMessage | WsMessage): void {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(serializeMessage(message));
    }
  }

  sendError(socket: WebSocket, code: string, message: string): void {
    this.send(socket, { event: 'ERROR', payload: { code, message } });
  }

  forwardToHost(room: RoomState, message: WsMessage): void {
    this.send(room.hostSocket, message);
  }

  broadcastToRoom(room: RoomState, message: OutgoingMessage, excludeSocket?: WebSocket): void {
    if (room.hostSocket !== excludeSocket && room.hostSocket.readyState === WebSocket.OPEN) {
      this.send(room.hostSocket, message);
    }
    for (const player of room.players.values()) {
      if (player.disconnectedAt) continue;
      if (player.socket !== excludeSocket && player.socket.readyState === WebSocket.OPEN) {
        this.send(player.socket, message);
      }
    }
  }

  broadcastToPlayers(room: RoomState, message: OutgoingMessage): void {
    for (const player of room.players.values()) {
      if (player.disconnectedAt) continue;
      this.send(player.socket, message);
    }
  }

  buildPlayerList(room: RoomState) {
    return [...room.players.values()].map(playerToInfo);
  }

  handleClientMessage(
    meta: ClientMeta,
    message: IncomingClientMessage,
  ): void {
    switch (message.event) {
      case 'PLAYER_JOIN':
      case 'PLAYER_REJOIN':
        break;
      case 'PLAYER_MOVE':
        this.handlePlayerMove(meta, message);
        break;
      case 'ABILITY_TRIGGER':
        this.handleAbilityTrigger(meta, message);
        break;
      case 'PASS_PACKAGE':
        this.handlePassPackage(meta, message);
        break;
    }
  }

  handleHostMessage(
    meta: ClientMeta,
    message: IncomingHostMessage,
  ): void {
    const roomCode = meta.roomCode;
    if (!roomCode) return;
    const room = this.getRoom(roomCode);
    if (!room) return;

    switch (message.event) {
      case 'ROOM_CREATE':
        break;
      case 'HOST_START':
        room.status = 'IN_GAME';
        this.broadcastToRoom(room, {
          event: 'GAME_STATE',
          payload: {
            room_code: roomCode,
            status: 'IN_GAME',
            round: 1,
            package_holder_id: null,
            players: this.buildPlayerList(room),
            has_pass: room.hasPass,
            ads_enabled: room.adsEnabled,
          },
        });
        break;
      case 'GAME_STATE':
        if (message.payload.status) {
          room.status = message.payload.status;
        }
        this.broadcastToPlayers(room, {
          ...message,
          payload: {
            ...message.payload,
            has_pass: room.hasPass,
            ads_enabled: room.adsEnabled,
          },
        });
        break;
      case 'ROUND_END':
        this.broadcastToRoom(room, message);
        break;
      case 'PACKAGE_EXPLODED':
        this.broadcastToRoom(room, message);
        break;
      case 'GAME_END':
        room.status = 'FINISHED';
        this.broadcastToRoom(room, message);
        break;
    }
  }

  joinPlayer(
    socket: WebSocket,
    roomCode: string,
    nickname: string,
    avatar?: string,
    cosmetics?: string[],
    preferredColor?: string,
  ): { playerId: string } | { error: string } {
    const normalizedCode = roomCode.toUpperCase().trim();
    const result = this.joinRoom(
      normalizedCode,
      socket,
      nickname,
      avatar,
      cosmetics,
      preferredColor,
    );
    if ('error' in result) {
      return { error: result.error };
    }

    const { playerId, room } = result;
    const player = room.players.get(playerId)!;
    const players = this.buildPlayerList(room);
    const joinedMessage: OutgoingMessage = {
      event: 'PLAYER_JOINED',
      payload: {
        room_code: room.roomCode,
        player: playerToInfo(player),
        players,
      },
    };

    this.broadcastToRoom(room, joinedMessage);
    return { playerId };
  }

  private handlePlayerMove(
    meta: ClientMeta,
    message: Extract<IncomingClientMessage, { event: 'PLAYER_MOVE' }>,
  ): void {
    if (!meta.roomCode || !meta.playerId) return;
    const room = this.getRoom(meta.roomCode);
    if (!room) return;

    const player = room.players.get(meta.playerId);
    if (!player || player.playerId !== message.payload.player_id) return;
    const { x, y } = message.payload;
    if (this.shouldThrottleMove(player, x, y)) return;

    this.forwardToHost(room, message);
  }

  private handleAbilityTrigger(
    meta: ClientMeta,
    message: Extract<IncomingClientMessage, { event: 'ABILITY_TRIGGER' }>,
  ): void {
    if (!meta.roomCode || !meta.playerId) return;
    const room = this.getRoom(meta.roomCode);
    if (!room) return;
    if (message.payload.player_id !== meta.playerId) return;

    this.forwardToHost(room, message);
  }

  private handlePassPackage(
    meta: ClientMeta,
    message: Extract<IncomingClientMessage, { event: 'PASS_PACKAGE' }>,
  ): void {
    if (!meta.roomCode || !meta.playerId) return;
    const room = this.getRoom(meta.roomCode);
    if (!room) return;
    if (message.payload.player_id !== meta.playerId) return;

    this.forwardToHost(room, message);
  }
}
