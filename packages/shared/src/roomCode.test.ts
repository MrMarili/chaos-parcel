import { describe, expect, it } from 'vitest';
import { generateRoomCode, isValidRoomCode } from './roomCode.js';
import { parseIncomingMessage, serializeMessage } from './protocol.js';

describe('roomCode', () => {
  it('generates a 4-character code from allowed alphabet', () => {
    const code = generateRoomCode();
    expect(code).toHaveLength(4);
    expect(isValidRoomCode(code)).toBe(true);
  });

  it('avoids existing codes', () => {
    const existing = new Set(['ABCD']);
    const code = generateRoomCode(existing);
    expect(code).not.toBe('ABCD');
  });
});

describe('protocol', () => {
  it('parses and serializes PLAYER_JOIN', () => {
    const msg = {
      event: 'PLAYER_JOIN' as const,
      payload: {
        room_code: 'XJ9R',
        nickname: 'Test',
      },
    };
    const parsed = parseIncomingMessage(msg, 'player');
    expect(parsed.event).toBe('PLAYER_JOIN');
    expect(serializeMessage(parsed)).toBe(JSON.stringify(msg));
  });

  it('parses host GAME_STATE', () => {
    const msg = {
      event: 'GAME_STATE' as const,
      payload: {
        room_code: 'XJ9R',
        status: 'IN_GAME' as const,
        round: 1,
        package_holder_id: 'usr_1',
        players: [],
      },
    };
    const parsed = parseIncomingMessage(msg, 'host');
    expect(parsed.event).toBe('GAME_STATE');
  });
});
