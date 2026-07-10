import type { RoundEndPayload } from '@chaos-parcel/shared';
import { PlayerAvatar } from './PlayerAvatar';

interface RoundStandingsProps {
  round: number;
  scores: RoundEndPayload['scores'];
  highlightPlayerId?: string;
  countdown?: number | null;
}

export function RoundStandings({
  round,
  scores,
  highlightPlayerId,
  countdown,
}: RoundStandingsProps) {
  const sorted = [...scores].sort((a, b) => b.total_score - a.total_score);

  return (
    <div className="round-standings">
      <div className="round-standings-header">
        <h2 className="round-standings-title">סוף סיבוב {round}</h2>
        {countdown != null && countdown > 0 && (
          <p className="round-standings-countdown">הסיבוב הבא בעוד {countdown}...</p>
        )}
      </div>

      <ul className="round-standings-list">
        {sorted.map((entry, index) => {
          const isMe = entry.player_id === highlightPlayerId;
          return (
            <li
              key={entry.player_id}
              className={`round-standings-row ${isMe ? 'is-me' : ''} ${entry.had_explosion ? 'had-explosion' : ''}`}
            >
              <span className="round-standings-rank">{index + 1}</span>
              <PlayerAvatar
                nickname={entry.nickname}
                color={entry.character_color}
                avatar={entry.avatar}
                size={40}
              />
              <div className="round-standings-info">
                <strong>{entry.nickname}</strong>
                <span className="round-standings-meta">
                  סה״כ: {entry.total_score}
                  {entry.round_score !== 0 && ` · סיבוב: ${entry.round_score}`}
                </span>
              </div>
              <div className="round-standings-badges">
                {entry.had_explosion && (
                  <span className="badge badge-explosion" title="התפוצץ בסיבוב">
                    💥 {(entry.explosion_count ?? 1) > 1 ? `×${entry.explosion_count}` : ''}
                  </span>
                )}
                {entry.survived && !entry.had_explosion && (
                  <span className="badge badge-safe">✓ שרד</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
