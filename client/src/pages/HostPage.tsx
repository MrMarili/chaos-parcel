import { useEffect, useRef, useState } from 'react';
import type { PlayerInfo, WsMessage } from '@chaos-parcel/shared';
import { useWebSocket } from '../hooks/useWebSocket';
import { useWebHostGame } from '../host/useWebHostGame';
import { HostArena } from '../components/HostArena';
import { ActivityLog } from '../components/ActivityLog';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { RoundStandings } from '../components/RoundStandings';
import { BrandMark } from '../components/BrandMark';
import { MIN_PLAYERS, TOTAL_ROUNDS } from '../host/hostGameTypes';

export function HostPage() {
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
  const [copied, setCopied] = useState(false);
  const gameMessageRef = useRef<(message: WsMessage) => void>(() => {});

  const handleRoomMessage = (message: WsMessage) => {
    if (message.event === 'ROOM_CREATED') {
      setRoomCode(message.payload.room_code);
      setJoinUrl(message.payload.join_url);
    }
    if (message.event === 'PLAYER_JOINED') {
      setPlayers(message.payload.players);
    }
    if (message.event === 'PLAYER_LEFT') {
      setPlayers(message.payload.players);
    }
  };

  const { connected, error, send } = useWebSocket({
    role: 'host',
    onMessage: (message) => {
      handleRoomMessage(message);
      gameMessageRef.current(message);
    },
  });

  const { snapshot, startGame, handleHostMessage, resetToLobby } = useWebHostGame(
    roomCode,
    players,
    send,
  );

  gameMessageRef.current = handleHostMessage;

  // Create room on every successful host connection
  useEffect(() => {
    if (connected) {
      send({
        event: 'ROOM_CREATE',
        payload: { host_version: '1.0.0-web' },
      });
    }
  }, [connected, send]);

  const handleCopy = async () => {
    if (!joinUrl) return;
    await navigator.clipboard.writeText(joinUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const qrSrc = joinUrl
    ? `https://quickchart.io/qr?size=240&margin=2&text=${encodeURIComponent(joinUrl)}`
    : null;

  const holderName = players.find((p) => p.player_id === snapshot.packageHolderId)?.nickname;

  if (snapshot.phase === 'playing' || snapshot.phase === 'round_end' || snapshot.phase === 'summary') {
    return (
      <div className="page host-page host-game">
        <BrandMark compact tagline="זירת המשחק" />
        {!connected && (
          <p className="error-text">החיבור לשרת נותק — רענן את הדף</p>
        )}

        {snapshot.phase !== 'round_end' && (
          <div className="host-game-header card">
            <div className="host-game-stat">
              <span className="host-label">סיבוב</span>
              <strong>{snapshot.round}/{TOTAL_ROUNDS}</strong>
            </div>
            <div className="host-game-stat">
              <span className="host-label">חבילה אצל</span>
              <strong>{holderName ?? '—'}</strong>
            </div>
            <div className="host-game-stat">
              <span className="host-label">טיימר</span>
              <strong className={snapshot.packageTimer < 5 ? 'timer-danger' : ''}>
                {snapshot.packageTimer.toFixed(1)}s
              </strong>
            </div>
          </div>
        )}

        {snapshot.phase === 'round_end' && snapshot.roundEndStandings ? (
          <div className="card">
            <RoundStandings
              round={snapshot.round}
              scores={snapshot.roundEndStandings}
              countdown={snapshot.roundEndCountdown}
            />
          </div>
        ) : (
          <HostArena snapshot={snapshot} />
        )}

        {snapshot.phase === 'playing' && <ActivityLog entries={snapshot.activityLog} />}

        {snapshot.phase === 'summary' && (
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              resetToLobby();
            }}
          >
            חזרה ללובי
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="page host-page">
      <div className="host-hero">
        <BrandMark tagline="שחקנים סורקים QR ומצטרפים מהטלפון" />
      </div>

      {!connected && (
        <p className="status-text">
          {roomCode ? 'מתחבר מחדש לשרת...' : 'מתחבר לשרת...'}
        </p>
      )}
      {connected && !roomCode && (
        <p className="status-text">יוצר חדר...</p>
      )}
      {error && <p className="error-text">{error}</p>}

      {roomCode && connected && (
        <div className="card host-room-card">
          <p className="host-label">קוד חדר</p>
          <p className="host-room-code">{roomCode}</p>

          {qrSrc && (
            <img className="host-qr" src={qrSrc} alt={`QR לחדר ${roomCode}`} width={240} height={240} />
          )}

          {joinUrl && (
            <div className="host-url-row">
              <a className="host-url" href={joinUrl} target="_blank" rel="noreferrer">
                {joinUrl}
              </a>
              <button type="button" className="btn-secondary" onClick={handleCopy}>
                {copied ? 'הועתק!' : 'העתק'}
              </button>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <p className="host-label">שחקנים מחוברים ({players.length})</p>
        {players.length === 0 ? (
          <p className="status-text">ממתין לשחקנים...</p>
        ) : (
          <ul className="player-list">
            {players.map((player) => (
              <li key={player.player_id} className="player-item">
                <PlayerAvatar
                  nickname={player.nickname}
                  color={player.character_color}
                  avatar={player.avatar}
                />
                <span>{player.nickname}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {roomCode && connected && players.length >= MIN_PLAYERS && (
        <button type="button" className="btn-primary" onClick={startGame}>
          התחל משחק
        </button>
      )}

      {roomCode && connected && players.length > 0 && players.length < MIN_PLAYERS && (
        <p className="status-text">
          צריך לפחות {MIN_PLAYERS} שחקנים כדי להתחיל (מחוברים: {players.length})
        </p>
      )}

      {roomCode && !connected && (
        <p className="error-text">
          החדר {roomCode} לא פעיל — המתן לחיבור מחדש או רענן את הדף
        </p>
      )}
    </div>
  );
}
