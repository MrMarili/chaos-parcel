const SESSION_PREFIX = 'chaos-parcel:player-session:';

export interface PlayerSession {
  roomCode: string;
  playerId: string;
  nickname: string;
  characterColor: string;
  avatar?: string;
}

function key(roomCode: string): string {
  return `${SESSION_PREFIX}${roomCode.toUpperCase()}`;
}

export function loadPlayerSession(roomCode: string): PlayerSession | null {
  try {
    const raw = sessionStorage.getItem(key(roomCode));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PlayerSession;
    if (
      !parsed?.playerId ||
      !parsed?.nickname ||
      !parsed?.characterColor ||
      parsed.roomCode?.toUpperCase() !== roomCode.toUpperCase()
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function savePlayerSession(session: PlayerSession): void {
  try {
    sessionStorage.setItem(key(session.roomCode), JSON.stringify(session));
  } catch {
    // Private mode / quota — rejoin just won't survive a full reload.
  }
}

export function clearPlayerSession(roomCode: string): void {
  try {
    sessionStorage.removeItem(key(roomCode));
  } catch {
    // ignore
  }
}
