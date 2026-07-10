import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import {
  MAX_PLAYERS_PER_ROOM,
  MOVE_THROTTLE_MS,
  generateRoomCode,
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

  createRoom(hostSocket: WebSocket, hostVersion: string): string {
    const existingCodes = new Set(this.rooms.keys());
    const roomCode = generateRoomCode(existingCodes);

    this.rooms.set(roomCode, {
      roomCode,
      hostSocket,
      hostVersion,
      players: new Map(),
      status: 'LOBBY',
      createdAt: new Date(),
    });

    return roomCode;
  }

  getRoom(roomCode: string): RoomState | undefined {
    return this.rooms.get(roomCode.toUpperCase());
  }

  deleteRoom(roomCode: string): void {
    this.rooms.delete(roomCode.toUpperCase());
  }

  joinRoom(
    roomCode: string,
    socket: WebSocket,
    nickname: string,
    characterColor: string,
    avatar?: string,
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

    const playerId = `usr_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
    const player: PlayerConnection = {
      playerId,
      socket,
      nickname,
      characterColor,
      avatar,
      lastMoveAt: 0,
    };
    room.players.set(playerId, player);

    return { playerId, room };
  }

  removePlayer(roomCode: string, playerId: string): RoomState | undefined {
    const room = this.getRoom(roomCode);
    if (!room) return undefined;
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

  shouldThrottleMove(player: PlayerConnection): boolean {
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
      if (player.socket !== excludeSocket && player.socket.readyState === WebSocket.OPEN) {
        this.send(player.socket, message);
      }
    }
  }

  broadcastToPlayers(room: RoomState, message: OutgoingMessage): void {
    for (const player of room.players.values()) {
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
          },
        });
        break;
      case 'GAME_STATE':
        if (message.payload.status) {
          room.status = message.payload.status;
        }
        this.broadcastToPlayers(room, message);
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
    characterColor: string,
    avatar?: string,
  ): { playerId: string } | { error: string } {
    const normalizedCode = roomCode.toUpperCase().trim();
    const result = this.joinRoom(normalizedCode, socket, nickname, characterColor, avatar);
    if ('error' in result) {
      return { error: result.error };
    }

    const { playerId, room } = result;
    const players = this.buildPlayerList(room);
    const joinedMessage: OutgoingMessage = {
      event: 'PLAYER_JOINED',
      payload: {
        room_code: room.roomCode,
        player: {
          player_id: playerId,
          nickname,
          character_color: characterColor,
          ...(avatar ? { avatar } : {}),
        },
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
    if (this.shouldThrottleMove(player)) return;

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
