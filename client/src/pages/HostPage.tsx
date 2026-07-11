import { useEffect, useRef, useState } from 'react';
import type { PlayerInfo, WsMessage } from '@chaos-parcel/shared';
import { useWebSocket } from '../hooks/useWebSocket';
import { useWebHostGame } from '../host/useWebHostGame';
import { HostArena } from '../components/HostArena';
import { HostGameRail } from '../components/HostGameRail';
import { HostGameSummary } from '../components/HostGameSummary';
import { PlayerHud } from '../components/PlayerHud';
import { RoundStandings } from '../components/RoundStandings';
import { BrandMark } from '../components/BrandMark';
import { MIN_PLAYERS } from '../host/hostGameTypes';
import { GameHowTo } from '../components/GameHowTo';
import { AdSlot } from '../components/AdSlot';
import { HOST_DOCUMENT_TITLE } from '../components/GameTitle';

export function HostPage() {
  useEffect(() => {
    document.title = HOST_DOCUMENT_TITLE;
  }, []);
  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [joinUrl, setJoinUrl] = useState<string | null>(null);
  const [players, setPlayers] = useState<PlayerInfo[]>([]);
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

  // Create room once per host socket connection (avoid wiping a live room).
  const roomCreateSentRef = useRef(false);
  useEffect(() => {
    if (!connected) {
      roomCreateSentRef.current = false;
      return;
    }
    if (roomCreateSentRef.current) return;
    roomCreateSentRef.current = true;
    send({
      event: 'ROOM_CREATE',
      payload: {
        host_version: '1.0.0-web',
        client_base_url: window.location.origin,
      },
    });
  }, [connected, send]);

  const qrSrc = joinUrl
    ? `https://quickchart.io/qr?size=240&margin=2&text=${encodeURIComponent(joinUrl)}`
    : null;

  const holderName = players.find((p) => p.player_id === snapshot.packageHolderId)?.nickname;

  if (snapshot.phase === 'summary' && snapshot.gameEnd) {
    return (
      <HostGameSummary
        gameEnd={snapshot.gameEnd}
        players={players}
        onNewGame={startGame}
        onBackToLobby={resetToLobby}
      />
    );
  }

  if (snapshot.phase === 'playing' || snapshot.phase === 'round_end') {
    const isRoundEnd = snapshot.phase === 'round_end' && snapshot.roundEndStandings;

    return (
      <div className="page host-page host-game">
        <div className="host-game-stage">
          {isRoundEnd ? (
            <div className="card host-standings-card">
              <RoundStandings
                round={snapshot.round}
                scores={snapshot.roundEndStandings!}
                countdown={snapshot.roundEndCountdown}
              />
              <AdSlot
                slot="host_round_end"
                variant="compact"
                className="host-round-end-ad"
              />
            </div>
          ) : (
            <div className="host-game-play">
              <div className="host-game-arena-col">
                <HostArena snapshot={snapshot} />
                <AdSlot
                  slot="host_arena"
                  variant="banner"
                  className="host-arena-ad"
                />
              </div>
              <HostGameRail
                snapshot={snapshot}
                holderName={holderName}
                connected={connected}
              />
            </div>
          )}
        </div>
      </div>
    );
  }

  const canStart =
    Boolean(roomCode && connected && players.length >= MIN_PLAYERS);

  return (
    <div
      className={`page host-page host-lobby host-lobby-with-arena${canStart ? ' host-lobby-ready' : ''}`}
    >
      <div className="host-lobby-scroll">
        <div className="host-hero">
          <BrandMark compact tagline="סרקו את ה־QR והצטרפו מהטלפון!" />
        </div>

        {!connected && (
          <p className="status-text host-lobby-status">
            {roomCode ? 'מתחבר מחדש לשרת...' : 'מתחבר לשרת...'}
          </p>
        )}
        {connected && !roomCode && (
          <p className="status-text host-lobby-status">יוצר חדר...</p>
        )}
        {error && <p className="error-text host-lobby-status">{error}</p>}

        <div className="host-lobby-body">
          <div className="card host-room-card">
            {roomCode && connected ? (
              <>
                <p className="host-label">קוד חדר</p>
                <p className="host-room-code">{roomCode}</p>

                {qrSrc && (
                  <img
                    className="host-qr"
                    src={qrSrc}
                    alt={`QR לחדר ${roomCode}`}
                    width={200}
                    height={200}
                  />
                )}

                {joinUrl && (
                  <div className="host-url-row">
                    <a className="host-url" href={joinUrl} target="_blank" rel="noreferrer">
                      {joinUrl}
                    </a>
                  </div>
                )}

                <AdSlot
                  slot="host_lobby"
                  variant="sponsor"
                  className="host-lobby-sponsor"
                />
              </>
            ) : (
              <p className="status-text">מכין חדר...</p>
            )}
          </div>

          <GameHowTo className="host-lobby-howto" />

          <div className="host-lobby-players-wrap">
            <p className="host-label host-lobby-panel-label">
              שחקנים מחוברים ({players.length})
            </p>
            <div className="card host-players-card">
              <PlayerHud
                players={snapshot.arenaPlayers}
                scores={snapshot.roundScores}
                holderId={snapshot.packageHolderId}
                showScores={false}
              />
              {players.length === 0 && (
                <p className="status-text">ממתין לשחקנים...</p>
              )}
            </div>
          </div>

          <div className="host-lobby-arena-wrap">
            <p className="host-label host-lobby-panel-label">
              הזיזו עם השלט כדי לבדוק חיבור
            </p>
            <HostArena snapshot={snapshot} />
          </div>
        </div>

        {roomCode && connected && players.length < MIN_PLAYERS && (
          <p className="status-text host-lobby-status">
            צריך לפחות {MIN_PLAYERS} שחקנים כדי להתחיל (מחוברים: {players.length})
          </p>
        )}

        {roomCode && !connected && (
          <p className="error-text host-lobby-status">
            החדר {roomCode} לא פעיל — המתן לחיבור מחדש או רענן את הדף
          </p>
        )}
      </div>

      {canStart && (
        <div className="host-lobby-footer">
          <button type="button" className="btn-primary" onClick={startGame}>
            התחל משחק
          </button>
        </div>
      )}
    </div>
  );
}
