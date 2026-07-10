import { useCallback, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { AbilityType } from '@chaos-parcel/shared';
import { useWebSocket } from './hooks/useWebSocket';
import { useGameState } from './hooks/useGameState';
import { JoinPage } from './pages/JoinPage';
import { LobbyPage } from './pages/LobbyPage';
import { GamePage } from './pages/GamePage';
import { RoundEndPage } from './pages/RoundEndPage';
import { SummaryPage } from './pages/SummaryPage';
import './index.css';

export default function App() {
  const { roomCode: roomCodeParam } = useParams<{ roomCode: string }>();
  const roomCode = (roomCodeParam ?? '').toUpperCase();
  const joinIdentityRef = useRef<{ nickname: string; color: string } | null>(null);
  const [joinedPlayerId, setJoinedPlayerId] = useState<string | null>(null);

  const { state, handleMessage, hasPackage, clearExplosion } = useGameState();

  const onWsMessage = useCallback(
    (message: Parameters<typeof handleMessage>[0]) => {
      if (
        message.event === 'PLAYER_JOINED' &&
        joinIdentityRef.current &&
        !joinedPlayerId
      ) {
        const { nickname, color } = joinIdentityRef.current;
        const self = message.payload.players.find(
          (p) =>
            p.nickname === nickname &&
            p.character_color.toLowerCase() === color.toLowerCase(),
        );
        if (self) {
          setJoinedPlayerId(self.player_id);
          handleMessage(message, self.player_id);
          return;
        }
      }
      handleMessage(message, joinedPlayerId ?? state.playerId ?? undefined);
    },
    [handleMessage, joinedPlayerId, state.playerId],
  );

  const { connected, error: wsError, send, clearError } = useWebSocket({
    role: 'player',
    onMessage: onWsMessage,
  });

  const handleJoin = (nickname: string, color: string, avatar?: string) => {
    clearError();
    joinIdentityRef.current = { nickname, color };
    send({
      event: 'PLAYER_JOIN',
      payload: {
        room_code: roomCode,
        nickname,
        character_color: color,
        ...(avatar ? { avatar } : {}),
      },
    });
  };

  const handleMove = useCallback(
    (x: number, y: number) => {
      const playerId = joinedPlayerId ?? state.playerId;
      if (!playerId) return;
      send({
        event: 'PLAYER_MOVE',
        payload: { player_id: playerId, x, y },
      });
    },
    [send, joinedPlayerId, state.playerId],
  );

  const handleAbility = useCallback(
    (ability: AbilityType) => {
      const playerId = joinedPlayerId ?? state.playerId;
      if (!playerId) return;
      send({
        event: 'ABILITY_TRIGGER',
        payload: { player_id: playerId, ability_type: ability },
      });
    },
    [send, joinedPlayerId, state.playerId],
  );

  const handlePass = useCallback(() => {
    const playerId = joinedPlayerId ?? state.playerId;
    if (!playerId) return;
    send({
      event: 'PASS_PACKAGE',
      payload: { player_id: playerId },
    });
  }, [send, joinedPlayerId, state.playerId]);

  if (!roomCode) {
    return (
      <div className="page">
        <h1 className="page-title">חבילה עוברת</h1>
        <p className="error-text">קוד חדר חסר. סרוק את ה-QR מהטלוויזיה.</p>
        <p className="status-text">
          מארח? פתח <a href="/host" style={{ color: '#ff8c66' }}>/host</a>
        </p>
      </div>
    );
  }

  const playerId = joinedPlayerId ?? state.playerId;
  const displayError = state.error ?? wsError;

  return (
    <div className="app-shell">
      {state.screen === 'join' && (
        <JoinPage
          roomCode={roomCode}
          connected={connected}
          error={displayError}
          onJoin={handleJoin}
        />
      )}

      {state.screen === 'lobby' && (
        <LobbyPage players={state.players} roomCode={roomCode} />
      )}

      {state.screen === 'playing' && playerId && (
        <GamePage
          playerId={playerId}
          hasPackage={hasPackage}
          round={state.gameState?.round ?? 1}
          timerSeconds={state.gameState?.timer_seconds}
          cooldowns={state.cooldowns}
          explosion={state.lastExplosion}
          onExplosionDone={clearExplosion}
          onMove={handleMove}
          onAbility={handleAbility}
          onPass={handlePass}
        />
      )}

      {state.screen === 'round_end' && state.roundEnd && playerId && (
        <RoundEndPage roundEnd={state.roundEnd} playerId={playerId} />
      )}

      {state.screen === 'summary' && state.gameEnd && playerId && (
        <SummaryPage gameEnd={state.gameEnd} playerId={playerId} players={state.players} />
      )}
    </div>
  );
}
