import type { GameEndPayload, PlayerInfo } from '@chaos-parcel/shared';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { BrandMark } from '../components/BrandMark';

interface SummaryPageProps {
  gameEnd: GameEndPayload;
  playerId: string;
  players: PlayerInfo[];
}

const CROWNS: Record<number, string> = { 1: '👑', 2: '🥈', 3: '🥉' };

export function SummaryPage({ gameEnd, playerId, players }: SummaryPageProps) {
  const myScore = gameEnd.final_scores.find((s) => s.player_id === playerId);
  const funFact = gameEnd.fun_facts?.[playerId];
  const sorted = [...gameEnd.final_scores].sort((a, b) => a.rank - b.rank);
  const podium = sorted.slice(0, 3);
  const rest = sorted.slice(3);

  const findPlayer = (id: string) => players.find((p) => p.player_id === id);

  return (
    <div className="page">
      <BrandMark compact tagline="סיכום המשחק" />

      {myScore && (
        <div className="card" style={{ textAlign: 'center' }}>
          <p style={{ fontSize: '1.9rem', fontWeight: 700, margin: 0, fontFamily: 'var(--font-display)' }}>
            מקום #{myScore.rank}
          </p>
          <p style={{ fontSize: '1.15rem', margin: '0.4rem 0 0', color: 'var(--amber)' }}>
            {myScore.total_score} נקודות
          </p>
        </div>
      )}

      {funFact && <p className="fun-fact">{funFact}</p>}

      {podium.length > 0 && (
        <div className="podium">
          {podium.map((score) => {
            const info = findPlayer(score.player_id);
            return (
              <div key={score.player_id} className={`podium-place rank-${score.rank}`}>
                <span className="podium-crown">{CROWNS[score.rank] ?? ''}</span>
                <div className="podium-avatar-wrap">
                  <PlayerAvatar
                    nickname={score.nickname}
                    color={info?.character_color ?? '#888'}
                    avatar={info?.avatar}
                    size={score.rank === 1 ? 64 : 48}
                  />
                </div>
                <span className="podium-name">{score.nickname}</span>
                <span className="podium-score">{score.total_score}</span>
                <div className="podium-bar">{score.rank}</div>
              </div>
            );
          })}
        </div>
      )}

      {rest.length > 0 && (
        <div className="card summary-list">
          {rest.map((score) => (
            <div key={score.player_id} className="summary-row">
              <span className="summary-row-rank">#{score.rank}</span>
              <span className="summary-row-name">{score.nickname}</span>
              <span className="summary-row-score">{score.total_score}</span>
            </div>
          ))}
        </div>
      )}

      <p className="status-text">ממתין למשחק חדש מהטלוויזיה...</p>
    </div>
  );
}
