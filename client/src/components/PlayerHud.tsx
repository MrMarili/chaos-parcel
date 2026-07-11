import type { ArenaPlayer } from '../host/hostGameTypes';
import { PlayerAvatar } from './PlayerAvatar';
import { ScoreValue } from './ScoreValue';

interface PlayerHudProps {
  players: ArenaPlayer[];
  scores: Record<string, number>;
  holderId: string | null;
  /** Optional heading for lobby / in-game. */
  title?: string;
  /** Lobby has no meaningful scores yet — hide the 0s. Default true. */
  showScores?: boolean;
}

/**
 * Single roster: icon + name + score (outside the arena).
 * Avatar circle is color/photo only — name sits beside it.
 */
export function PlayerHud({
  players,
  scores,
  holderId,
  title,
  showScores = true,
}: PlayerHudProps) {
  const sorted = showScores
    ? [...players].sort((a, b) => (scores[b.playerId] ?? 0) - (scores[a.playerId] ?? 0))
    : [...players];

  return (
    <div className="player-hud">
      {title && <p className="host-label player-hud-title">{title}</p>}
      {sorted.map((player) => {
        const hasPackage = holderId === player.playerId;
        const score = scores[player.playerId] ?? 0;
        return (
          <div
            key={player.playerId}
            className={`player-hud-card ${hasPackage ? 'has-package' : ''}`}
          >
            <PlayerAvatar
              nickname={player.nickname}
              color={player.color}
              avatar={player.avatar}
              size={22}
            />
            <span className="player-hud-info">
              <span className="player-hud-name">{player.nickname}</span>
              {showScores && <ScoreValue value={score} className="player-hud-score" />}
            </span>
            {hasPackage && <span className="player-hud-package-icon">📦</span>}
          </div>
        );
      })}
    </div>
  );
}
