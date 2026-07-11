import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { AbilityType } from '@chaos-parcel/shared';
import { useWebSocket } from './hooks/useWebSocket';
import { useGameState } from './hooks/useGameState';
import { JoinPage } from './pages/JoinPage';
import { LobbyPage } from './pages/LobbyPage';
import { GamePage } from './pages/GamePage';
import { RoundEndPage } from './pages/RoundEndPage';
import { SummaryPage } from './pages/SummaryPage';
import { GameTitle, PLAYER_DOCUMENT_TITLE } from './components/GameTitle';
import {
  clearPlayerSession,
  loadPlayerSession,
  savePlayerSession,
} from './session';
import {
  saveLocalDeviceProfile,
  syncDeviceProfileToServer,
} from './deviceProfile';
import type { JoinPayload } from './pages/JoinPage';
import './index.css';

export default function App() {
  useEffect(() => {
    document.title = PLAYER_DOCUMENT_TITLE;
  }, []);
  const { roomCode: roomCodeParam } = useParams<{ roomCode: string }>();
  const roomCode = (roomCodeParam ?? '').toUpperCase();
  const joinIdentityRef = useRef<{
    nickname: string;
    avatar?: string;
    deviceId?: string;
  } | null>(null);
  const [joinedPlayerId, setJoinedPlayerId] = useState<string | null>(() =>
    roomCode ? (loadPlayerSession(roomCode)?.playerId ?? null) : null,
  );
  const [reconnecting, setReconnecting] = useState(false);
  const rejoiningRef = useRef(false);
  const rejoinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sendRef = useRef<(message: Record<string, unknown>) => boolean>(() => false);
  const joinedPlayerIdRef = useRef(joinedPlayerId);
  joinedPlayerIdRef.current = joinedPlayerId;

  const { state, dispatch, handleMessage, hasPackage, clearExplosion } = useGameState();
  const playerIdRef = useRef(state.playerId);
  playerIdRef.current = state.playerId;

  const clearRejoinAttempt = useCallback(() => {
    rejoiningRef.current = false;
    if (rejoinTimeoutRef.current) {
      clearTimeout(rejoinTimeoutRef.current);
      rejoinTimeoutRef.current = null;
    }
  }, []);

  const loseSession = useCallback(
    (error: string) => {
      clearPlayerSession(roomCode);
      setJoinedPlayerId(null);
      joinIdentityRef.current = null;
      clearRejoinAttempt();
      setReconnecting(false);
      dispatch({ type: 'SESSION_LOST', error });
    },
    [roomCode, dispatch, clearRejoinAttempt],
  );

  const tryRejoin = useCallback(() => {
    if (!roomCode || rejoiningRef.current) return false;
    const session = loadPlayerSession(roomCode);
    const playerId =
      session?.playerId ?? joinedPlayerIdRef.current ?? playerIdRef.current ?? null;
    if (!playerId) return false;

    rejoiningRef.current = true;
    setReconnecting(true);
    if (session) {
      joinIdentityRef.current = {
        nickname: session.nickname,
        ...(session.avatar ? { avatar: session.avatar } : {}),
      };
    }
    setJoinedPlayerId(playerId);
    if (rejoinTimeoutRef.current) clearTimeout(rejoinTimeoutRef.current);
    // If PLAYER_JOINED never arrives, unlock so the next socket open can retry.
    rejoinTimeoutRef.current = setTimeout(() => {
      rejoiningRef.current = false;
      rejoinTimeoutRef.current = null;
    }, 10_000);

    const sent = sendRef.current({
      event: 'PLAYER_REJOIN',
      payload: {
        room_code: roomCode,
        player_id: playerId,
      },
    });
    if (!sent) {
      clearRejoinAttempt();
    }
    return sent;
  }, [roomCode, clearRejoinAttempt]);

  const onWsMessage = useCallback(
    (message: Parameters<typeof handleMessage>[0]) => {
      if (message.event === 'ERROR') {
        const code = message.payload.code;
        if (
          code === 'PLAYER_NOT_FOUND' ||
          code === 'REJOIN_EXPIRED' ||
          code === 'ROOM_NOT_FOUND' ||
          code === 'ROOM_FINISHED'
        ) {
          loseSession(message.payload.message);
          return;
        }
        // Non-fatal error during rejoin — allow another attempt.
        clearRejoinAttempt();
      }

      if (message.event === 'HOST_DISCONNECTED') {
        clearPlayerSession(roomCode);
        setJoinedPlayerId(null);
        joinIdentityRef.current = null;
        clearRejoinAttempt();
        setReconnecting(false);
      }

      if (message.event === 'PLAYER_JOINED') {
        const session = loadPlayerSession(roomCode);
        const identity = joinIdentityRef.current;
        const self =
          message.payload.players.find((p) => p.player_id === joinedPlayerId) ??
          message.payload.players.find((p) => p.player_id === session?.playerId) ??
          (identity
            ? message.payload.player.nickname === identity.nickname
              ? message.payload.player
              : message.payload.players.find((p) => p.nickname === identity.nickname)
            : undefined);

        if (self) {
          setJoinedPlayerId(self.player_id);
          savePlayerSession({
            roomCode,
            playerId: self.player_id,
            nickname: self.nickname,
            characterColor: self.character_color,
            ...(self.avatar ? { avatar: self.avatar } : {}),
          });
          joinIdentityRef.current = {
            nickname: self.nickname,
            ...(self.avatar ? { avatar: self.avatar } : {}),
          };

          // Remember last successful join for the next party (device profile).
          const deviceId = identity?.deviceId;
          if (deviceId) {
            const saved = saveLocalDeviceProfile({
              nickname: self.nickname,
              characterColor: self.character_color,
              ...(self.avatar ? { avatar: self.avatar } : {}),
              ...(self.cosmetics?.length ? { cosmetics: self.cosmetics } : {}),
            });
            void syncDeviceProfileToServer(saved);
          }

          clearRejoinAttempt();
          setReconnecting(false);
          handleMessage(message, self.player_id);
          return;
        }
      }

      if (
        message.event === 'PLAYER_LEFT' &&
        message.payload.player_id === (joinedPlayerId ?? loadPlayerSession(roomCode)?.playerId)
      ) {
        loseSession('נותקת מהחדר. הצטרף מחדש.');
        return;
      }

      handleMessage(message, joinedPlayerId ?? state.playerId ?? undefined);
    },
    [handleMessage, joinedPlayerId, state.playerId, roomCode, loseSession, clearRejoinAttempt],
  );

  const { connected, error: wsError, send, clearError } = useWebSocket({
    role: 'player',
    onMessage: onWsMessage,
    onOpen: () => {
      tryRejoin();
    },
    onClose: () => {
      // Unlock rejoin so the next successful open can send PLAYER_REJOIN again.
      clearRejoinAttempt();
      if (loadPlayerSession(roomCode) || joinedPlayerIdRef.current || playerIdRef.current) {
        setReconnecting(true);
      }
    },
  });

  sendRef.current = send;

  // After reload with a saved session, rejoin once the socket is up.
  useEffect(() => {
    if (!connected || !roomCode) return;
    if (!loadPlayerSession(roomCode) && !joinedPlayerIdRef.current && !playerIdRef.current) {
      return;
    }
    tryRejoin();
  }, [connected, roomCode, tryRejoin]);

  useEffect(() => {
    return () => {
      if (rejoinTimeoutRef.current) clearTimeout(rejoinTimeoutRef.current);
    };
  }, []);

  const handleJoin = (payload: JoinPayload) => {
    clearError();
    clearPlayerSession(roomCode);
    joinIdentityRef.current = {
      nickname: payload.nickname,
      deviceId: payload.deviceId,
      ...(payload.avatar ? { avatar: payload.avatar } : {}),
    };
    setJoinedPlayerId(null);
    clearRejoinAttempt();
    setReconnecting(false);
    send({
      event: 'PLAYER_JOIN',
      payload: {
        room_code: roomCode,
        nickname: payload.nickname,
        device_id: payload.deviceId,
        ...(payload.avatar ? { avatar: payload.avatar } : {}),
        ...(payload.cosmetics?.length ? { cosmetics: payload.cosmetics } : {}),
        ...(payload.characterColor ? { character_color: payload.characterColor } : {}),
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
    if (!state.gameState?.can_pass) return;
    send({
      event: 'PASS_PACKAGE',
      payload: { player_id: playerId },
    });
  }, [send, joinedPlayerId, state.playerId, state.gameState?.can_pass]);

  if (!roomCode) {
    return (
      <div className="page">
        <GameTitle className="page-title" />
        <p className="error-text">קוד חדר חסר. סרוק את ה-QR מהמסך הראשי.</p>
        <p className="status-text">
          מארח? פתח <a href="/host" style={{ color: '#ff8c66' }}>/host</a>
        </p>
      </div>
    );
  }

  const playerId = joinedPlayerId ?? state.playerId;
  const displayError = state.error ?? wsError;
  const showReconnectBanner = state.screen !== 'join' && (!connected || reconnecting);

  return (
    <div className="app-shell">
      {showReconnectBanner && (
        <div className="reconnect-banner" role="status">
          {connected ? 'מתחבר מחדש לחדר...' : 'החיבור נותק — מתחבר מחדש...'}
        </div>
      )}

      {state.screen === 'join' && (
        <JoinPage
          roomCode={roomCode}
          connected={connected}
          error={displayError}
          onJoin={handleJoin}
        />
      )}

      {state.screen === 'lobby' && (
        <LobbyPage
          players={state.players}
          roomCode={roomCode}
          onMove={handleMove}
        />
      )}

      {state.screen === 'playing' && playerId && (
        <GamePage
          playerId={playerId}
          hasPackage={hasPackage}
          canPass={hasPackage && state.gameState?.can_pass === true}
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
        <RoundEndPage
          roundEnd={state.roundEnd}
          playerId={playerId}
          wasHoldingPackage={state.gameState?.package_holder_id === playerId}
        />
      )}

      {state.screen === 'summary' && state.gameEnd && playerId && (
        <SummaryPage
          gameEnd={state.gameEnd}
          playerId={playerId}
          players={state.players}
        />
      )}
    </div>
  );
}
