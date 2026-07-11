import { useCallback, useEffect, useRef, useState } from 'react';
import type { AbilityType, PlayerInfo, WsMessage } from '@chaos-parcel/shared';
import { ABILITY_LABELS } from '../config';
import { generateRoundObstacles } from './arenaObstacles';
import {
  type ArenaPlayer,
  type HostGameSnapshot,
  type LogType,
  PACKAGE_TIMER_MAX,
  PACKAGE_PASS_RANGE,
  ROUND_DURATION_SEC,
  ROUND_END_PAUSE_SEC,
  EXPLOSION_DISPLAY_MS,
  TOTAL_ROUNDS,
  MOVE_SPEED_PER_SEC,
  PACKAGE_MOVE_MULTIPLIER,
  MIN_PLAYERS,
  buildGameStatePayload,
  displayName,
  findNearestPlayer,
  ltrName,
  makeLog,
  pickRandomHolder,
  resolvePlayerName,
} from './hostGameTypes';
import { placeRosterSpread, syncArenaPlayers } from './playerSpawn';
import {
  clearAllVelocities,
  drainAbilityHits,
  freezePlayer,
  readPositionsInto,
  resetMovementRuntime,
  setArenaObstacles,
  setPlayerVelocity,
  startAbilityWave,
  syncMovementPlayers,
  tickMovement,
} from './movementRuntime';

type SendFn = (message: Record<string, unknown>) => boolean;

function createInitialSnapshot(): HostGameSnapshot {
  return {
    phase: 'lobby',
    round: 1,
    packageHolderId: null,
    packageTimer: PACKAGE_TIMER_MAX,
    roundRemainingSec: ROUND_DURATION_SEC,
    arenaPlayers: [],
    obstacles: [],
    activityLog: [],
    roundScores: {},
    roundExplosionCounts: {},
    timeWithoutPackage: {},
    abilitiesReceived: {},
    lastExplosion: null,
    roundEndCountdown: null,
    roundEndStandings: null,
    gameEnd: null,
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
  const lastReactSyncRef = useRef(0);

  snapshotRef.current = snapshot;
  playersRef.current = players;

  const pushLog = useCallback((type: LogType, text: string) => {
    setSnapshot((prev) => ({
      ...prev,
        activityLog: [makeLog(type, text), ...prev.activityLog].slice(0, 40),
    }));
  }, []);

  const broadcastState = useCallback(
    (next: HostGameSnapshot) => {
      if (!roomCode) return;
      const live: HostGameSnapshot = {
        ...next,
        arenaPlayers: readPositionsInto(next.arenaPlayers),
      };
      send({
        event: 'GAME_STATE',
        payload: buildGameStatePayload(roomCode, live, playersRef.current),
      });
    },
    [roomCode, send],
  );

  const applySnapshot = useCallback(
    (updater: (prev: HostGameSnapshot) => HostGameSnapshot, broadcast = true) => {
      setSnapshot((prev) => {
        const next = updater(prev);
        const live: HostGameSnapshot = {
          ...next,
          arenaPlayers: readPositionsInto(next.arenaPlayers),
        };
        snapshotRef.current = live;
        if (broadcast && live.phase === 'playing' && roomCode) {
          send({
            event: 'GAME_STATE',
            payload: buildGameStatePayload(roomCode, live, playersRef.current),
          });
        }
        return live;
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
    if (!roomCode) return;

    // Prefer currently connected players; fall back to arena / last finale roster
    // so "משחק חדש" still works after the summary screen.
    const byId = new Map<string, PlayerInfo>();
    for (const p of playersRef.current) {
      byId.set(p.player_id, p);
    }
    for (const p of snapshotRef.current.arenaPlayers) {
      if (byId.has(p.playerId)) continue;
      byId.set(p.playerId, {
        player_id: p.playerId,
        nickname: p.nickname,
        character_color: p.color,
        ...(p.avatar ? { avatar: p.avatar } : {}),
      });
    }
    const finale = snapshotRef.current.gameEnd?.final_scores;
    if (finale) {
      for (const s of finale) {
        if (byId.has(s.player_id)) continue;
        byId.set(s.player_id, {
          player_id: s.player_id,
          nickname: s.nickname,
          character_color: '#5B8DEF',
        });
      }
    }

    const roster = [...byId.values()];
    if (roster.length < MIN_PLAYERS) {
      // Surface why the button appears dead (common when only one player remains).
      window.alert(`צריך לפחות ${MIN_PLAYERS} שחקנים כדי להתחיל משחק חדש (מחוברים: ${roster.length}).`);
      return;
    }

    // Clear any leftover round-end timer from the previous match.
    if (roundEndTimerRef.current) {
      clearInterval(roundEndTimerRef.current);
      roundEndTimerRef.current = null;
    }

    // Re-open the room on the server (GAME_END sets status FINISHED).
    send({ event: 'HOST_START', payload: { room_code: roomCode } });

    clearAllVelocities();
    resetMovementRuntime();

    // Always reshuffle around fresh obstacles; package holder is random each start.
    const obstacles = generateRoundObstacles();
    setArenaObstacles(obstacles);
    const arenaPlayers = placeRosterSpread(roster, obstacles);

    const scores: Record<string, number> = {};
    roster.forEach((p) => {
      scores[p.player_id] = 0;
    });

    const { packageHolderId, packageTimer } = assignPackage(arenaPlayers);
    roundElapsedRef.current = 0;

    const holder = roster.find((p) => p.player_id === packageHolderId);

    const next: HostGameSnapshot = {
      phase: 'playing',
      round: 1,
      packageHolderId,
      packageTimer,
      roundRemainingSec: ROUND_DURATION_SEC,
      arenaPlayers,
      obstacles,
      activityLog: [
        makeLog('start', `משחק חדש! החבילה אצל ${ltrName(displayName(holder?.nickname))}`),
      ],
      roundScores: scores,
      roundExplosionCounts: {},
      timeWithoutPackage: {},
      abilitiesReceived: {},
      lastExplosion: null,
      roundEndCountdown: null,
      roundEndStandings: null,
      gameEnd: null,
    };

    setSnapshot(next);
    snapshotRef.current = next;
    syncMovementPlayers(arenaPlayers, { resetPositions: true });
    // Explicit IN_GAME broadcast so phones leave the summary screen.
    broadcastState(next);
  }, [roomCode, send, assignPackage, broadcastState]);

  const concludeGameRef = useRef<
    (
      nextTotals: Record<string, number>,
      opts?: {
        roundExplosionCounts?: Record<string, number>;
        timeWithoutPackage?: Record<string, number>;
        logText?: string;
      },
    ) => void
  >(() => {});

  const startNextRound = useCallback(() => {
    if (!roomCode) return;
    const current = snapshotRef.current;

    if (playersRef.current.length < MIN_PLAYERS) {
      concludeGameRef.current(current.roundScores, {
        logText: 'לא נשארו מספיק שחקנים — המשחק הסתיים',
      });
      return;
    }

    if (roundEndTimerRef.current) {
      clearInterval(roundEndTimerRef.current);
      roundEndTimerRef.current = null;
    }

    clearAllVelocities();
    const obstacles = generateRoundObstacles();
    setArenaObstacles(obstacles);
    const arenaPlayers = placeRosterSpread(playersRef.current, obstacles);
    const { packageHolderId, packageTimer } = assignPackage(arenaPlayers);
    const holder = playersRef.current.find((p) => p.player_id === packageHolderId);
    roundElapsedRef.current = 0;

    const next: HostGameSnapshot = {
      ...current,
      phase: 'playing',
      round: current.round + 1,
      packageHolderId,
      packageTimer,
      roundRemainingSec: ROUND_DURATION_SEC,
      arenaPlayers,
      obstacles,
      roundExplosionCounts: {},
      timeWithoutPackage: {},
      lastExplosion: null,
      roundEndCountdown: null,
      roundEndStandings: null,
      gameEnd: null,
      activityLog: [
        makeLog('round', `סיבוב ${current.round + 1} התחיל — החבילה אצל ${ltrName(displayName(holder?.nickname))}`),
        ...current.activityLog,
      ].slice(0, 12),
    };

    setSnapshot(next);
    snapshotRef.current = next;
    syncMovementPlayers(arenaPlayers, { resetPositions: true });
    broadcastState(next);
  }, [roomCode, assignPackage, broadcastState]);

  const concludeGame = useCallback(
    (
      nextTotals: Record<string, number>,
      opts?: {
        roundExplosionCounts?: Record<string, number>;
        timeWithoutPackage?: Record<string, number>;
        logText?: string;
      },
    ) => {
      if (!roomCode) return;
      const current = snapshotRef.current;
      if (current.phase === 'summary' || current.phase === 'lobby') return;

      if (roundEndTimerRef.current) {
        clearInterval(roundEndTimerRef.current);
        roundEndTimerRef.current = null;
      }
      clearAllVelocities();

      const roundExplosionCounts = opts?.roundExplosionCounts ?? current.roundExplosionCounts;
      const timeWithoutPackage = opts?.timeWithoutPackage ?? current.timeWithoutPackage;
      const abilitiesReceived = current.abilitiesReceived;

      // Include everyone who scored this game — not only players still connected at the end.
      type RosterEntry = {
        player_id: string;
        nickname: string;
        character_color: string;
        avatar?: string;
      };
      const byId = new Map<string, RosterEntry>();
      for (const p of playersRef.current) {
        byId.set(p.player_id, {
          player_id: p.player_id,
          nickname: p.nickname,
          character_color: p.character_color,
          ...(p.avatar ? { avatar: p.avatar } : {}),
        });
      }
      for (const p of current.arenaPlayers) {
        if (byId.has(p.playerId)) continue;
        byId.set(p.playerId, {
          player_id: p.playerId,
          nickname: p.nickname,
          character_color: p.color,
          ...(p.avatar ? { avatar: p.avatar } : {}),
        });
      }
      for (const id of Object.keys(nextTotals)) {
        if (byId.has(id)) continue;
        byId.set(id, {
          player_id: id,
          nickname: 'שחקן',
          character_color: '#888888',
        });
      }

      const ranked = [...byId.values()].sort(
        (a, b) => (nextTotals[b.player_id] ?? 0) - (nextTotals[a.player_id] ?? 0),
      );

      const mostTargeted =
        ranked.length > 0
          ? ranked.reduce((best, p) =>
              (abilitiesReceived[p.player_id] ?? 0) > (abilitiesReceived[best.player_id] ?? 0)
                ? p
                : best,
            ranked[0]!)
          : null;

      const earlyEnd = Boolean(opts?.logText);
      const funFacts: Record<string, string> = {};
      for (const p of ranked) {
        const received = abilitiesReceived[p.player_id] ?? 0;
        if (earlyEnd && ranked.length === 1) {
          funFacts[p.player_id] = 'נשארת אחרון בזירה — כל הכבוד!';
        } else if (earlyEnd) {
          funFacts[p.player_id] = 'המשחק נעצר כי לא נשארו מספיק שחקנים.';
        } else if (mostTargeted && p.player_id === mostTargeted.player_id && received > 0) {
          funFacts[p.player_id] =
            `היית השחקן הכי פחות אהוב בחדר: הפעילו עליך ${received} יכולות כאוס!`;
        } else if ((roundExplosionCounts[p.player_id] ?? 0) > 0) {
          funFacts[p.player_id] = `החבילה אהבה אותך קצת יותר מדי בסיבוב האחרון...`;
        } else {
          funFacts[p.player_id] = `שרדת כמו אלוף — תמשיך לברוח מהחבילה!`;
        }
      }

      const gameEndPayload = {
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
      };

      send({
        event: 'GAME_END',
        payload: gameEndPayload,
      });

      const next: HostGameSnapshot = {
        ...current,
        phase: 'summary',
        roundScores: nextTotals,
        roundEndCountdown: null,
        roundEndStandings: null,
        packageHolderId: null,
        packageTimer: 0,
        gameEnd: gameEndPayload,
        activityLog: [
          makeLog('end', opts?.logText ?? 'המשחק הסתיים!'),
          ...current.activityLog,
        ].slice(0, 40),
      };
      setSnapshot(next);
      snapshotRef.current = next;
    },
    [roomCode, send],
  );
  concludeGameRef.current = concludeGame;

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

    if (current.round >= TOTAL_ROUNDS || playersRef.current.length < MIN_PLAYERS) {
      concludeGame(nextTotals, {
        roundExplosionCounts,
        timeWithoutPackage,
        logText:
          playersRef.current.length < MIN_PLAYERS
            ? 'לא נשארו מספיק שחקנים — המשחק הסתיים'
            : undefined,
      });
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
      packageHolderId: null,
      packageTimer: 0,
      roundScores: nextTotals,
      roundEndCountdown: countdown,
      roundEndStandings: standings,
      lastExplosion: null,
      activityLog: [
        makeLog('round', `סוף סיבוב ${current.round} — מציגים תוצאות`),
        ...current.activityLog,
      ].slice(0, 12),
    };

    clearAllVelocities();
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
  }, [roomCode, send, startNextRound, concludeGame]);

  const endRound = finishRound;

  const handlePlayerMove = useCallback((playerId: string, x: number, y: number) => {
    const phase = snapshotRef.current.phase;
    if (phase !== 'playing' && phase !== 'lobby') return;
    setPlayerVelocity(playerId, x, y);
  }, []);

  // Smooth host-side integration → direct DOM (React only syncs occasionally)
  useEffect(() => {
    if (snapshot.phase !== 'playing' && snapshot.phase !== 'lobby') return;

    syncMovementPlayers(snapshotRef.current.arenaPlayers);

    let last = performance.now();
    let frameId = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      const current = snapshotRef.current;
      tickMovement(
        dt,
        current.packageHolderId,
        MOVE_SPEED_PER_SEC,
        PACKAGE_MOVE_MULTIPLIER,
      );

      const abilityHits = drainAbilityHits();
      if (abilityHits.length > 0) {
        const abilitiesReceived = { ...snapshotRef.current.abilitiesReceived };
        for (const victimId of abilityHits) {
          abilitiesReceived[victimId] = (abilitiesReceived[victimId] ?? 0) + 1;
        }
        snapshotRef.current = { ...snapshotRef.current, abilitiesReceived };
      }

      // Keep logical positions fresh for pass / nearest-player without re-rendering.
      const syncedPlayers = readPositionsInto(snapshotRef.current.arenaPlayers);
      snapshotRef.current = { ...snapshotRef.current, arenaPlayers: syncedPlayers };

      // Occasional React sync so HUD / lists stay consistent (not every frame).
      if (now - lastReactSyncRef.current > 100) {
        lastReactSyncRef.current = now;
        setSnapshot((prev) => {
          if (prev.phase !== 'playing' && prev.phase !== 'lobby') return prev;
          const hits = snapshotRef.current.abilitiesReceived;
          return {
            ...prev,
            arenaPlayers: readPositionsInto(prev.arenaPlayers),
            abilitiesReceived: hits,
          };
        });
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [snapshot.phase]);

  const handleAbility = useCallback(
    (playerId: string, ability: AbilityType, _targetId?: string) => {
      const current = snapshotRef.current;
      if (current.phase !== 'playing') return;

      const arenaPlayers = readPositionsInto(current.arenaPlayers);
      const caster = arenaPlayers.find((p) => p.playerId === playerId);
      if (!caster) return;

      startAbilityWave(playerId, ability);

      pushLog(
        'ability',
        `${ltrName(displayName(caster.nickname))} הפעיל ${ABILITY_LABELS[ability]}`,
      );

      setSnapshot((prev) => ({
        ...prev,
        arenaPlayers: readPositionsInto(prev.arenaPlayers),
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

      const arenaPlayers = readPositionsInto(current.arenaPlayers);
      const fromLive = arenaPlayers.find((p) => p.playerId === playerId) ?? from;
      const others = arenaPlayers.filter((p) => p.playerId !== playerId);
      if (others.length === 0) {
        if (playersRef.current.length < MIN_PLAYERS) {
          concludeGame(current.roundScores, {
            logText: 'לא נשארו מספיק שחקנים — המשחק הסתיים',
          });
        } else {
          pushLog('info', 'אין שחקן אחר למסור לו');
        }
        return;
      }

      const requested =
        targetId != null
          ? arenaPlayers.find((p) => p.playerId === targetId && p.playerId !== playerId)
          : undefined;
      const nearby = findNearestPlayer(fromLive, arenaPlayers, PACKAGE_PASS_RANGE);
      const target =
        requested &&
        Math.hypot(requested.x - fromLive.x, requested.y - fromLive.y) < PACKAGE_PASS_RANGE
          ? requested
          : nearby;

      if (!target) {
        pushLog('info', 'צריך להתקרב לשחקן כדי למסור');
        return;
      }

      const passer = playersRef.current.find((p) => p.player_id === playerId);
      applySnapshot((prev) => ({
        ...prev,
        packageHolderId: target.playerId,
        // Each pass shortens the fuse by 1 second (floor at 1s).
        packageTimer: Math.max(1, prev.packageTimer - 1),
        activityLog: [
          makeLog('pass', `${ltrName(displayName(passer?.nickname))} מסר את החבילה ל-${ltrName(displayName(target.nickname))}`),
          ...prev.activityLog,
        ].slice(0, 12),
      }));
    },
    [applySnapshot, pushLog, concludeGame],
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
      // Rejoining mid-game: push current state immediately so the phone isn't stuck
      // waiting for the next 250ms tick (and so they leave the reconnect banner).
      if (message.event === 'PLAYER_JOINED') {
        const snap = snapshotRef.current;
        if (snap.phase === 'playing' || snap.phase === 'round_end') {
          broadcastState(snap);
        }
      }
    },
    [handlePlayerMove, handleAbility, handlePassPackage, broadcastState],
  );

  // Game timer tick
  useEffect(() => {
    if (snapshot.phase !== 'playing') return;

    const interval = setInterval(() => {
      if (snapshotRef.current.phase !== 'playing') return;

      roundElapsedRef.current += 0.25;
      const roundRemainingSec = Math.max(
        0,
        ROUND_DURATION_SEC - roundElapsedRef.current,
      );

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
          const holderName = resolvePlayerName(
            explodedId,
            arenaPlayers,
            playersRef.current,
          );

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
          const newHolderName = resolvePlayerName(
            packageHolderId,
            arenaPlayers,
            playersRef.current,
          );

          const explosionStartedAt = Date.now();
          const lastExplosion = {
            playerId: explodedId,
            nickname: holderName,
            startedAt: explosionStartedAt,
          };

          // Lock exploded player in place until boom animation ends.
          freezePlayer(explodedId, EXPLOSION_DISPLAY_MS);

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
            roundRemainingSec,
            roundScores,
            roundExplosionCounts,
            timeWithoutPackage,
            lastExplosion,
            activityLog,
            arenaPlayers: readPositionsInto(arenaPlayers),
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
          roundRemainingSec,
          roundScores,
          timeWithoutPackage,
          activityLog,
          arenaPlayers: readPositionsInto(arenaPlayers),
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

  // Keep arena tokens in sync with roster (lobby + in-game leavers after grace).
  useEffect(() => {
    if (snapshot.phase !== 'lobby' && snapshot.phase !== 'playing') return;
    setSnapshot((prev) => {
      const arenaPlayers = syncArenaPlayers(players, prev.arenaPlayers, prev.obstacles);
      syncMovementPlayers(arenaPlayers);
      return { ...prev, arenaPlayers };
    });
  }, [players, snapshot.phase]);

  // Too few players left mid-game / between rounds → go straight to the finale.
  useEffect(() => {
    if (snapshot.phase !== 'playing' && snapshot.phase !== 'round_end') return;
    if (players.length >= MIN_PLAYERS) return;
    concludeGame(snapshotRef.current.roundScores, {
      logText: 'לא נשארו מספיק שחקנים — המשחק הסתיים',
    });
  }, [players.length, snapshot.phase, concludeGame]);

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
    resetToLobby: () => {
      if (roundEndTimerRef.current) {
        clearInterval(roundEndTimerRef.current);
        roundEndTimerRef.current = null;
      }
      resetMovementRuntime();
      setArenaObstacles([]);
      const next: HostGameSnapshot = {
        ...createInitialSnapshot(),
        arenaPlayers: syncArenaPlayers(playersRef.current, []),
        obstacles: [],
      };
      setSnapshot(next);
      snapshotRef.current = next;
      if (roomCode) {
        send({
          event: 'GAME_STATE',
          payload: buildGameStatePayload(roomCode, next, playersRef.current),
        });
      }
    },
  };
}
