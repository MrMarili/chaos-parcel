import type { ArenaPlayer } from '../host/hostGameTypes';

interface PlayerHudProps {
  players: ArenaPlayer[];
  scores: Record<string, number>;
  holderId: string | null;
}

/** Side score cards shown alongside the arena during play — nickname, avatar, score. */
export function PlayerHud({ players, scores, holderId }: PlayerHudProps) {
  const sorted = [...players].sort(
    (a, b) => (scores[b.playerId] ?? 0) - (scores[a.playerId] ?? 0),
  );

  return (
    <div className="player-hud">
      {sorted.map((player) => {
        const hasPackage = holderId === player.playerId;
        return (
          <div
            key={player.playerId}
            className={`player-hud-card ${hasPackage ? 'has-package' : ''}`}
          >
            <span
              className="player-hud-avatar"
              style={{
                borderColor: player.color,
                background: player.avatar ? '#000' : player.color,
              }}
            >
              {player.avatar ? (
                <img src={player.avatar} alt={player.nickname} />
              ) : (
                player.nickname.charAt(0).toUpperCase()
              )}
            </span>
            <span className="player-hud-info">
              <span className="player-hud-name">{player.nickname}</span>
              <span className="player-hud-score">{scores[player.playerId] ?? 0}</span>
            </span>
            {hasPackage && <span className="player-hud-package-icon">📦</span>}
          </div>
        );
      })}
    </div>
  );
}
