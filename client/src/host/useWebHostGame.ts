import { useCallback, useEffect, useRef, useState } from 'react';
import type { AbilityType, PlayerInfo, WsMessage } from '@chaos-parcel/shared';
import { ABILITY_LABELS } from '../config';
import {
  type ArenaPlayer,
  type HostGameSnapshot,
  type LogType,
  PACKAGE_TIMER_MAX,
  ROUND_DURATION_SEC,
  ROUND_END_PAUSE_SEC,
  EXPLOSION_DISPLAY_MS,
  TOTAL_ROUNDS,
  MOVE_SPEED,
  MIN_PLAYERS,
  buildGameStatePayload,
  clamp01,
  displayName,
  findNearestPlayer,
  ltrName,
  makeLog,
  pickRandomHolder,
  playerInfoToArena,
} from './hostGameTypes';

type SendFn = (message: Record<string, unknown>) => boolean;

function createInitialSnapshot(): HostGameSnapshot {
  return {
    phase: 'lobby',
    round: 1,
    packageHolderId: null,
    packageTimer: PACKAGE_TIMER_MAX,
    arenaPlayers: [],
    activityLog: [],
    roundScores: {},
    roundExplosionCounts: {},
    timeWithoutPackage: {},
    abilitiesReceived: {},
    lastExplosion: null,
    roundEndCountdown: null,
    roundEndStandings: null,
  };
}

export function useWebHostGame(
  roomCode: string | null,
  players: PlayerInfo[],
  send: SendFn,
) {
  const [snapshot, setSnapshot] = useState<HostGameSnapshot>(createInitialSnapshot);
  const snapshotRef = useRef(snapshot);
  const playersRef = useRef(players);
  const roundElapsedRef = useRef(0);
  const roundEndTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  snapshotRef.current = snapshot;
  playersRef.current = players;

  const pushLog = useCallback((type: LogType, text: string) => {
    setSnapshot((prev) => ({
      ...prev,
      activityLog: [makeLog(type, text), ...prev.activityLog].slice(0, 12),
    }));
  }, []);

  const broadcastState = useCallback(
    (next: HostGameSnapshot) => {
      if (!roomCode) return;
      send({
        event: 'GAME_STATE',
        payload: buildGameStatePayload(roomCode, next, playersRef.current),
      });
    },
    [roomCode, send],
  );

  const applySnapshot = useCallback(
    (updater: (prev: HostGameSnapshot) => HostGameSnapshot, broadcast = true) => {
      setSnapshot((prev) => {
        const next = updater(prev);
        snapshotRef.current = next;
        if (broadcast && next.phase === 'playing' && roomCode) {
          send({
            event: 'GAME_STATE',
            payload: buildGameStatePayload(roomCode, next, playersRef.current),
          });
        }
        return next;
      });
    },
    [roomCode, send],
  );

  const assignPackage = useCallback(
    (arenaPlayers: ArenaPlayer[], excludeId?: string) => {
      const holderId = pickRandomHolder(arenaPlayers, excludeId);
      return {
        packageHolderId: holderId,
        packageTimer: PACKAGE_TIMER_MAX,
      };
    },
    [],
  );

  const startGame = useCallback(() => {
    if (!roomCode || players.length < MIN_PLAYERS) return;

    send({ event: 'HOST_START', payload: { room_code: roomCode } });

    const arenaPlayers = players.map((p, i) => playerInfoToArena(p, i));
    const scores: Record<string, number> = {};
    players.forEach((p) => {
      scores[p.player_id] = 0;
    });

    const { packageHolderId, packageTimer } = assignPackage(arenaPlayers);
    roundElapsedRef.current = 0;

    const holder = players.find((p) => p.player_id === packageHolderId);
    const next: HostGameSnapshot = {
      phase: 'playing',
      round: 1,
      packageHolderId,
      packageTimer,
      arenaPlayers,
      activityLog: [
        makeLog('start', `המשחק התחיל! החבילה אצל ${ltrName(displayName(holder?.nickname))}`),
      ],
      roundScores: scores,
      roundExplosionCounts: {},
      timeWithoutPackage: {},
      abilitiesReceived: {},
      lastExplosion: null,
      roundEndCountdown: null,
      roundEndStandings: null,
    };

    setSnapshot(next);
    snapshotRef.current = next;
    broadcastState(next);
  }, [roomCode, players, send, assignPackage, broadcastState]);

  const startNextRound = useCallback(() => {
    if (!roomCode) return;
    const current = snapshotRef.current;

    if (roundEndTimerRef.current) {
      clearInterval(roundEndTimerRef.current);
      roundEndTimerRef.current = null;
    }

    const arenaPlayers = playersRef.current.map((p, i) => playerInfoToArena(p, i));
    const { packageHolderId, packageTimer } = assignPackage(arenaPlayers);
    const holder = playersRef.current.find((p) => p.player_id === packageHolderId);
    roundElapsedRef.current = 0;

    const next: HostGameSnapshot = {
      ...current,
      phase: 'playing',
      round: current.round + 1,
      packageHolderId,
      packageTimer,
      arenaPlayers,
      roundExplosionCounts: {},
      timeWithoutPackage: {},
      lastExplosion: null,
      roundEndCountdown: null,
      roundEndStandings: null,
      activityLog: [
        makeLog('round', `סיבוב ${current.round + 1} התחיל — החבילה אצל ${ltrName(displayName(holder?.nickname))}`),
        ...current.activityLog,
      ].slice(0, 12),
    };

    setSnapshot(next);
    snapshotRef.current = next;
    broadcastState(next);
  }, [roomCode, assignPackage, broadcastState]);

  const finishRound = useCallback(() => {
    if (!roomCode) return;
    const current = snapshotRef.current;
    if (current.phase !== 'playing') return;

    const roundExplosionCounts = current.roundExplosionCounts;
    const timeWithoutPackage = current.timeWithoutPackage;

    // Spec scoring: explosion −50 applied live on boom; at round end add survivor +100 and time bonus.
    const roundScoreByPlayer: Record<string, number> = {};
    const nextTotals: Record<string, number> = { ...current.roundScores };

    for (const p of playersRef.current) {
      const explosions = roundExplosionCounts[p.player_id] ?? 0;
      const timeBonus = Math.floor(timeWithoutPackage[p.player_id] ?? 0);
      const survivorBonus = explosions === 0 ? 100 : 0;
      const endBonuses = survivorBonus + timeBonus;
      // Live totals already include −50 per explosion; round_score shows full round delta.
      roundScoreByPlayer[p.player_id] = endBonuses - 50 * explosions;
      nextTotals[p.player_id] = (nextTotals[p.player_id] ?? 0) + endBonuses;
    }

    send({
      event: 'ROUND_END',
      payload: {
        room_code: roomCode,
        round: current.round,
        scores: playersRef.current.map((p) => {
          const explosions = roundExplosionCounts[p.player_id] ?? 0;
          return {
            player_id: p.player_id,
            nickname: p.nickname,
            character_color: p.character_color,
            avatar: p.avatar,
            round_score: roundScoreByPlayer[p.player_id] ?? 0,
            total_score: nextTotals[p.player_id] ?? 0,
            survived: explosions === 0,
            had_explosion: explosions > 0,
            explosion_count: explosions,
          };
        }),
      },
    });

    if (current.round >= TOTAL_ROUNDS) {
      const ranked = [...playersRef.current].sort(
        (a, b) => (nextTotals[b.player_id] ?? 0) - (nextTotals[a.player_id] ?? 0),
      );

      const abilitiesReceived = current.abilitiesReceived;
      const mostTargeted = ranked.reduce((best, p) =>
        (abilitiesReceived[p.player_id] ?? 0) > (abilitiesReceived[best.player_id] ?? 0) ? p : best,
      ranked[0]!);

      const funFacts: Record<string, string> = {};
      for (const p of ranked) {
        const received = abilitiesReceived[p.player_id] ?? 0;
        if (p.player_id === mostTargeted.player_id && received > 0) {
          funFacts[p.player_id] = `היית השחקן הכי פחות אהוב בחדר: הפעילו עליך ${received} יכולות כאוס!`;
        } else if ((roundExplosionCounts[p.player_id] ?? 0) > 0) {
          funFacts[p.player_id] = `החבילה אהבה אותך קצת יותר מדי בסיבוב האחרון...`;
        } else {
          funFacts[p.player_id] = `שרדת כמו אלוף — תמשיך לברוח מהחבילה!`;
        }
      }

      send({
        event: 'GAME_END',
        payload: {
          room_code: roomCode,
          final_scores: ranked.map((p, i) => ({
            player_id: p.player_id,
            nickname: p.nickname,
            total_score: nextTotals[p.player_id] ?? 0,
            rank: i + 1,
            stats: {
              abilities_received: abilitiesReceived[p.player_id] ?? 0,
              bombs_exploded: roundExplosionCounts[p.player_id] ?? 0,
              time_without_package_seconds: Math.floor(timeWithoutPackage[p.player_id] ?? 0),
            },
          })),
          fun_facts: funFacts,
        },
      });

      setSnapshot((prev) => ({
        ...prev,
        phase: 'summary',
        roundScores: nextTotals,
        roundEndCountdown: null,
        activityLog: [makeLog('end', 'המשחק הסתיים!'), ...prev.activityLog],
      }));
      return;
    }

    let countdown = ROUND_END_PAUSE_SEC;
    const standings = playersRef.current.map((p) => {
      const explosions = roundExplosionCounts[p.player_id] ?? 0;
      return {
        player_id: p.player_id,
        nickname: p.nickname,
        character_color: p.character_color,
        avatar: p.avatar,
        round_score: roundScoreByPlayer[p.player_id] ?? 0,
        total_score: nextTotals[p.player_id] ?? 0,
        survived: explosions === 0,
        had_explosion: explosions > 0,
        explosion_count: explosions,
      };
    });

    const next: HostGameSnapshot = {
      ...current,
      phase: 'round_end',
      roundScores: nextTotals,
      roundEndCountdown: countdown,
      roundEndStandings: standings,
      lastExplosion: null,
      activityLog: [
        makeLog('round', `סוף סיבוב ${current.round} — מציגים תוצאות`),
        ...current.activityLog,
      ].slice(0, 12),
    };

    setSnapshot(next);
    snapshotRef.current = next;

    roundEndTimerRef.current = setInterval(() => {
      countdown -= 1;
      if (countdown <= 0) {
        if (roundEndTimerRef.current) {
          clearInterval(roundEndTimerRef.current);
          roundEndTimerRef.current = null;
        }
        startNextRound();
        return;
      }
      setSnapshot((prev) => {
        if (prev.phase !== 'round_end') return prev;
        const updated = { ...prev, roundEndCountdown: countdown };
        snapshotRef.current = updated;
        return updated;
      });
    }, 1000);
  }, [roomCode, send, startNextRound]);

  const endRound = finishRound;

  const handlePlayerMove = useCallback(
    (playerId: string, x: number, y: number) => {
      if (snapshotRef.current.phase !== 'playing') return;
      if (Math.abs(x) < 0.05 && Math.abs(y) < 0.05) return;

      applySnapshot((prev) => ({
        ...prev,
        arenaPlayers: prev.arenaPlayers.map((p) =>
          p.playerId === playerId
            ? {
                ...p,
                x: clamp01(p.x + x * MOVE_SPEED),
                y: clamp01(p.y + y * MOVE_SPEED),
              }
            : p,
        ),
      }), false);
    },
    [applySnapshot],
  );

  const handleAbility = useCallback(
    (playerId: string, ability: AbilityType, targetId?: string) => {
      const actor = playersRef.current.find((p) => p.player_id === playerId);
      const target = playersRef.current.find(
        (p) => p.player_id === (targetId ?? playerId),
      );
      pushLog(
        'ability',
        `${ltrName(displayName(actor?.nickname))} הפעיל ${ABILITY_LABELS[ability]} על ${ltrName(displayName(target?.nickname))}`,
      );
      const victimId = targetId ?? playerId;
      setSnapshot((prev) => ({
        ...prev,
        abilitiesReceived: {
          ...prev.abilitiesReceived,
          [victimId]: (prev.abilitiesReceived[victimId] ?? 0) + 1,
        },
      }));
    },
    [pushLog],
  );

  const handlePassPackage = useCallback(
    (playerId: string, targetId?: string) => {
      const current = snapshotRef.current;
      if (current.phase !== 'playing' || current.packageHolderId !== playerId) return;

      const from = current.arenaPlayers.find((p) => p.playerId === playerId);
      if (!from) return;

      const others = current.arenaPlayers.filter((p) => p.playerId !== playerId);
      if (others.length === 0) {
        pushLog('info', 'אין שחקן אחר למסור לו');
        return;
      }

      const target =
        current.arenaPlayers.find((p) => p.playerId === targetId && p.playerId !== playerId) ??
        findNearestPlayer(from, current.arenaPlayers) ??
        others[Math.floor(Math.random() * others.length)]!;

      const passer = playersRef.current.find((p) => p.player_id === playerId);
      applySnapshot((prev) => ({
        ...prev,
        packageHolderId: target.playerId,
        packageTimer: PACKAGE_TIMER_MAX,
        activityLog: [
          makeLog('pass', `${ltrName(displayName(passer?.nickname))} מסר את החבילה ל-${ltrName(displayName(target.nickname))}`),
          ...prev.activityLog,
        ].slice(0, 12),
      }));
    },
    [applySnapshot, pushLog],
  );

  const handleHostMessage = useCallback(
    (message: WsMessage) => {
      if (message.event === 'PLAYER_MOVE') {
        handlePlayerMove(
          message.payload.player_id,
          message.payload.x,
          message.payload.y,
        );
      }
      if (message.event === 'ABILITY_TRIGGER') {
        handleAbility(
          message.payload.player_id,
          message.payload.ability_type,
          message.payload.target_player_id,
        );
      }
      if (message.event === 'PASS_PACKAGE') {
        handlePassPackage(
          message.payload.player_id,
          message.payload.target_player_id,
        );
      }
    },
    [handlePlayerMove, handleAbility, handlePassPackage],
  );

  // Game timer tick
  useEffect(() => {
    if (snapshot.phase !== 'playing') return;

    const interval = setInterval(() => {
      roundElapsedRef.current += 0.25;

      setSnapshot((prev) => {
        if (prev.phase !== 'playing') return prev;

        let {
          packageTimer,
          packageHolderId,
          roundScores,
          arenaPlayers,
          activityLog,
        } = prev;

        packageTimer = Math.max(0, packageTimer - 0.25);

        // Time bonus: +1s for every player who does not currently hold the package.
        const timeWithoutPackage = { ...prev.timeWithoutPackage };
        for (const p of arenaPlayers) {
          if (p.playerId !== packageHolderId) {
            timeWithoutPackage[p.playerId] = (timeWithoutPackage[p.playerId] ?? 0) + 0.25;
          }
        }

        if (packageTimer <= 0 && packageHolderId) {
          const explodedId = packageHolderId;
          const holder = playersRef.current.find((p) => p.player_id === explodedId);
          const holderName = displayName(holder?.nickname);

          roundScores = {
            ...roundScores,
            [explodedId]: (roundScores[explodedId] ?? 0) - 50,
          };

          const roundExplosionCounts = {
            ...prev.roundExplosionCounts,
            [explodedId]: (prev.roundExplosionCounts[explodedId] ?? 0) + 1,
          };

          const assigned = assignPackage(arenaPlayers, explodedId);
          packageHolderId = assigned.packageHolderId;
          packageTimer = assigned.packageTimer;
          const newHolder = playersRef.current.find((p) => p.player_id === packageHolderId);
          const newHolderName = displayName(newHolder?.nickname);

          const explosionStartedAt = Date.now();
          const lastExplosion = {
            playerId: explodedId,
            nickname: holderName,
            startedAt: explosionStartedAt,
          };

          activityLog = [
            makeLog(
              'explosion',
              `בום! החבילה התפוצצה אצל ${ltrName(holderName)}. עכשיו אצל ${ltrName(newHolderName)}`,
            ),
            ...activityLog,
          ].slice(0, 12);

          if (roomCode) {
            send({
              event: 'PACKAGE_EXPLODED',
              payload: {
                room_code: roomCode,
                exploded_player_id: explodedId,
                exploded_nickname: holderName,
                new_holder_id: packageHolderId,
                new_holder_nickname: newHolderName,
              },
            });
          }

          const next: HostGameSnapshot = {
            ...prev,
            packageTimer,
            packageHolderId,
            roundScores,
            roundExplosionCounts,
            timeWithoutPackage,
            lastExplosion,
            activityLog,
          };

          snapshotRef.current = next;

          if (roomCode) {
            send({
              event: 'GAME_STATE',
              payload: buildGameStatePayload(roomCode, next, playersRef.current),
            });
          }

          setTimeout(() => {
            setSnapshot((s) => {
              if (s.lastExplosion?.startedAt !== explosionStartedAt) return s;
              const cleared = { ...s, lastExplosion: null };
              snapshotRef.current = cleared;
              return cleared;
            });
          }, EXPLOSION_DISPLAY_MS);

          return next;
        }

        const next: HostGameSnapshot = {
          ...prev,
          packageTimer,
          packageHolderId,
          roundScores,
          timeWithoutPackage,
          activityLog,
        };

        snapshotRef.current = next;

        if (roomCode) {
          send({
            event: 'GAME_STATE',
            payload: buildGameStatePayload(roomCode, next, playersRef.current),
          });
        }

        return next;
      });

      if (roundElapsedRef.current >= ROUND_DURATION_SEC) {
        endRound();
      }
    }, 250);

    return () => clearInterval(interval);
  }, [snapshot.phase, roomCode, send, assignPackage, endRound]);

  // Sync arena when new players join mid-lobby
  useEffect(() => {
    if (snapshot.phase !== 'lobby') return;
    setSnapshot((prev) => ({
      ...prev,
      arenaPlayers: players.map((p, i) => playerInfoToArena(p, i)),
    }));
  }, [players, snapshot.phase]);

  useEffect(() => {
    return () => {
      if (roundEndTimerRef.current) {
        clearInterval(roundEndTimerRef.current);
      }
    };
  }, []);

  return {
    snapshot,
    startGame,
    handleHostMessage,
    resetToLobby: () => setSnapshot(createInitialSnapshot()),
  };
}
