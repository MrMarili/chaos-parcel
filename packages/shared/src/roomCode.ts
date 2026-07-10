import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH } from './constants.js';

export function generateRoomCode(existing?: Set<string>): string {
  const taken = existing ?? new Set<string>();
  const maxAttempts = 1000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      const index = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length);
      code += ROOM_CODE_ALPHABET[index];
    }
    if (!taken.has(code)) {
      return code;
    }
  }

  throw new Error('Failed to generate unique room code');
}

export function isValidRoomCode(code: string): boolean {
  if (code.length !== ROOM_CODE_LENGTH) return false;
  return [...code].every((char) => ROOM_CODE_ALPHABET.includes(char));
}
