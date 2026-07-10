/**
 * E2E integration test script — simulates Host + Player flow against running server.
 *
 * Usage:
 *   1. Start server: pnpm dev:server
 *   2. Run: pnpm --filter @chaos-parcel/server test:e2e
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import { serializeMessage } from '@chaos-parcel/shared';

const WS_URL = process.env.WS_URL ?? 'ws://localhost:3001/ws';
const TIMEOUT = 5000;

function waitForMessage(ws: WebSocket, eventName: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${eventName}`)), TIMEOUT);

    const handler = (data: WebSocket.RawData) => {
      const msg = JSON.parse(data.toString()) as { event: string; payload: unknown };
      if (msg.event === eventName) {
        clearTimeout(timer);
        ws.off('message', handler);
        resolve(msg);
      }
    };

    ws.on('message', handler);
  });
}

describe('E2E: Host + Player flow', () => {
  let hostWs: WebSocket;
  let playerWs: WebSocket;
  let roomCode: string;
  let playerId: string;

  beforeAll(async () => {
    hostWs = new WebSocket(`${WS_URL}?role=host`);
    await new Promise<void>((resolve, reject) => {
      hostWs.on('open', resolve);
      hostWs.on('error', reject);
    });

    hostWs.send(serializeMessage({
      event: 'ROOM_CREATE',
      payload: { host_version: '1.0.0' },
    }));

    const created = await waitForMessage(hostWs, 'ROOM_CREATED') as {
      payload: { room_code: string };
    };
    roomCode = created.payload.room_code;
    expect(roomCode).toHaveLength(4);

    playerWs = new WebSocket(`${WS_URL}?role=player`);
    await new Promise<void>((resolve, reject) => {
      playerWs.on('open', resolve);
      playerWs.on('error', reject);
    });

    const hostJoinPromise = waitForMessage(hostWs, 'PLAYER_JOINED');
    const playerJoinPromise = waitForMessage(playerWs, 'PLAYER_JOINED');

    playerWs.send(serializeMessage({
      event: 'PLAYER_JOIN',
      payload: {
        room_code: roomCode,
        nickname: 'E2E Player',
        character_color: '#FF5733',
      },
    }));

    const joined = await playerJoinPromise as {
      payload: { player: { player_id: string } };
    };
    playerId = joined.payload.player.player_id;
    await hostJoinPromise;
  }, 15000);

  afterAll(() => {
    hostWs?.close();
    playerWs?.close();
  });

  it('room was created with valid code', () => {
    expect(roomCode).toHaveLength(4);
  });

  it('player received id on join', () => {
    expect(playerId).toMatch(/^usr_/);
  });

  it('player move is forwarded to host', async () => {
    const movePromise = waitForMessage(hostWs, 'PLAYER_MOVE');

    playerWs.send(serializeMessage({
      event: 'PLAYER_MOVE',
      payload: { player_id: playerId, x: 0.5, y: -0.5 },
    }));

    const move = await movePromise as {
      payload: { x: number; y: number };
    };
    expect(move.payload.x).toBeCloseTo(0.5);
    expect(move.payload.y).toBeCloseTo(-0.5);
  }, 10000);

  it('host can broadcast GAME_STATE to players', async () => {
    const statePromise = waitForMessage(playerWs, 'GAME_STATE');

    hostWs.send(serializeMessage({
      event: 'GAME_STATE',
      payload: {
        room_code: roomCode,
        status: 'IN_GAME',
        round: 1,
        package_holder_id: null,
        players: [],
      },
    }));

    const state = await statePromise as { payload: { status: string } };
    expect(state.payload.status).toBe('IN_GAME');
  }, 10000);
});
