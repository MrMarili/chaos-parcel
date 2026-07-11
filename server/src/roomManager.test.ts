import { describe, expect, it, vi, beforeEach } from 'vitest';
import { WebSocket } from 'ws';
import { PLAYER_DISCONNECT_GRACE_MS } from '@chaos-parcel/shared';
import { RoomManager } from './roomManager.js';

function createMockSocket(): WebSocket {
  return {
    readyState: WebSocket.OPEN,
    send: vi.fn(),
  } as unknown as WebSocket;
}

describe('RoomManager', () => {
  let manager: RoomManager;

  beforeEach(() => {
    manager = new RoomManager();
  });

  it('creates a unique room for host', () => {
    const host = createMockSocket();
    const code = manager.createRoom(host, '1.0.0');
    expect(code).toHaveLength(4);
    expect(manager.getRoom(code)).toBeDefined();
  });

  it('allows player join and broadcasts PLAYER_JOINED', () => {
    const host = createMockSocket();
    const player = createMockSocket();
    const code = manager.createRoom(host, '1.0.0');

    const result = manager.joinPlayer(player, code, 'Nir');
    expect('playerId' in result).toBe(true);
    if ('playerId' in result) {
      expect(result.playerId).toMatch(/^usr_/);
    }

    expect(player.send).toHaveBeenCalled();
    expect(host.send).toHaveBeenCalled();
  });

  it('throttles PLAYER_MOVE above 45Hz but always allows stop', () => {
    const host = createMockSocket();
    const playerSocket = createMockSocket();
    const code = manager.createRoom(host, '1.0.0');
    const join = manager.joinPlayer(playerSocket, code, 'A');
    if ('error' in join) throw new Error(join.error);

    const room = manager.getRoom(code)!;
    const player = room.players.get(join.playerId)!;

    expect(manager.shouldThrottleMove(player, 1, 0)).toBe(false);
    expect(manager.shouldThrottleMove(player, 1, 0)).toBe(true);
    expect(manager.shouldThrottleMove(player, 0, 0)).toBe(false);
  });

  it('cleans up room on host disconnect', () => {
    const host = createMockSocket();
    const player = createMockSocket();
    const code = manager.createRoom(host, '1.0.0');
    manager.joinPlayer(player, code, 'B');

    manager.handleHostDisconnect(code);
    expect(manager.getRoom(code)).toBeUndefined();
    expect(player.send).toHaveBeenCalled();
  });

  it('keeps player seat during grace and allows rejoin', () => {
    vi.useFakeTimers();
    const host = createMockSocket();
    const playerSocket = createMockSocket();
    const code = manager.createRoom(host, '1.0.0');
    const join = manager.joinPlayer(playerSocket, code, 'A');
    if ('error' in join) throw new Error(join.error);

    manager.markPlayerDisconnected(code, join.playerId, playerSocket);
    expect(manager.getRoom(code)!.players.has(join.playerId)).toBe(true);

    const newSocket = createMockSocket();
    const rejoin = manager.rejoinPlayer(newSocket, code, join.playerId);
    expect('playerId' in rejoin).toBe(true);
    if ('error' in rejoin) throw new Error(rejoin.error);
    expect(manager.getRoom(code)!.players.get(join.playerId)!.socket).toBe(newSocket);
    expect(manager.getRoom(code)!.players.get(join.playerId)!.disconnectedAt).toBeUndefined();

    vi.useRealTimers();
  });

  it('ignores disconnect from a stale socket after rejoin', () => {
    const host = createMockSocket();
    const oldSocket = createMockSocket();
    const code = manager.createRoom(host, '1.0.0');
    const join = manager.joinPlayer(oldSocket, code, 'A');
    if ('error' in join) throw new Error(join.error);

    manager.markPlayerDisconnected(code, join.playerId, oldSocket);
    const newSocket = createMockSocket();
    const rejoin = manager.rejoinPlayer(newSocket, code, join.playerId);
    if ('error' in rejoin) throw new Error(rejoin.error);

    // Delayed close of the old connection must not re-flag the player.
    manager.markPlayerDisconnected(code, join.playerId, oldSocket);
    const player = manager.getRoom(code)!.players.get(join.playerId)!;
    expect(player.disconnectedAt).toBeUndefined();
    expect(player.socket).toBe(newSocket);
  });

  it('removes player after grace expires', () => {
    vi.useFakeTimers();
    const host = createMockSocket();
    const playerSocket = createMockSocket();
    const code = manager.createRoom(host, '1.0.0');
    const join = manager.joinPlayer(playerSocket, code, 'A');
    if ('error' in join) throw new Error(join.error);

    manager.markPlayerDisconnected(code, join.playerId, playerSocket);
    vi.advanceTimersByTime(PLAYER_DISCONNECT_GRACE_MS);
    expect(manager.getRoom(code)!.players.has(join.playerId)).toBe(false);
    expect(host.send).toHaveBeenCalled();

    vi.useRealTimers();
  });

  it('assigns distinct colors to players in the same room', () => {
    const host = createMockSocket();
    const code = manager.createRoom(host, '1.0.0');
    const colors: string[] = [];
    for (let i = 0; i < 6; i++) {
      const join = manager.joinPlayer(createMockSocket(), code, `P${i}`);
      if ('error' in join) throw new Error(join.error);
      const color = manager.getRoom(code)!.players.get(join.playerId)!.characterColor;
      colors.push(color);
    }
    expect(new Set(colors).size).toBe(6);
  });
});
