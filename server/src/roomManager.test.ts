import { describe, expect, it, vi, beforeEach } from 'vitest';
import { WebSocket } from 'ws';
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

    const result = manager.joinPlayer(player, code, 'Nir', '#FF5733');
    expect('playerId' in result).toBe(true);
    if ('playerId' in result) {
      expect(result.playerId).toMatch(/^usr_/);
    }

    expect(player.send).toHaveBeenCalled();
    expect(host.send).toHaveBeenCalled();
  });

  it('throttles PLAYER_MOVE above 45Hz', () => {
    const host = createMockSocket();
    const playerSocket = createMockSocket();
    const code = manager.createRoom(host, '1.0.0');
    const join = manager.joinPlayer(playerSocket, code, 'A', '#FF0000');
    if ('error' in join) throw new Error(join.error);

    const room = manager.getRoom(code)!;
    const player = room.players.get(join.playerId)!;

    expect(manager.shouldThrottleMove(player)).toBe(false);
    expect(manager.shouldThrottleMove(player)).toBe(true);
  });

  it('cleans up room on host disconnect', () => {
    const host = createMockSocket();
    const player = createMockSocket();
    const code = manager.createRoom(host, '1.0.0');
    manager.joinPlayer(player, code, 'B', '#00FF00');

    manager.handleHostDisconnect(code);
    expect(manager.getRoom(code)).toBeUndefined();
    expect(player.send).toHaveBeenCalled();
  });
});
