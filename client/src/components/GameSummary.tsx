import type { ReactNode } from 'react';
import type { GameEndPayload, PlayerInfo } from '@chaos-parcel/shared';
import { GameTitle } from './GameTitle';
import { PlayerAvatar } from './PlayerAvatar';
import { ScoreValue } from './ScoreValue';

const CROWNS: Record<number, string> = { 1: '👑', 2: '🥈', 3: '🥉' };

export interface GameSummaryProps {
  gameEnd: GameEndPayload;
  players: PlayerInfo[];
  variant: 'host' | 'phone';
  /** Highlight this player's personal result (phone). */
  playerId?: string;
  footer?: ReactNode;
}

/** Visual podium order: 2nd · 1st · 3rd (or 2nd · 1st when only two). */
function arrangePodium<T>(items: T[]): T[] {
  if (items.length === 3) return [items[1]!, items[0]!, items[2]!];
  if (items.length === 2) return [items[1]!, items[0]!];
  return items;
}

export function GameSummary({
  gameEnd,
  players,
  variant,
  playerId,
  footer,
}: GameSummaryProps) {
  // Rank by score (authoritative), then by declared rank as tie-break.
  const sorted = [...gameEnd.final_scores].sort((a, b) => {
    if (b.total_score !== a.total_score) return b.total_score - a.total_score;
    return a.rank - b.rank;
  });

  // Top 2 when there are 2 players; top 3 when there are 3+.
  const podiumLimit = Math.min(3, sorted.length);
  const podiumRaw = sorted.slice(0, podiumLimit);
  const podium = arrangePodium(podiumRaw);
  const rest = sorted.slice(podiumLimit);
  const winner = sorted[0];
  const myScore = playerId
    ? gameEnd.final_scores.find((s) => s.player_id === playerId)
    : undefined;
  const funFact = playerId ? gameEnd.fun_facts?.[playerId] : undefined;

  const findPlayer = (id: string) => players.find((p) => p.player_id === id);
  const isHost = variant === 'host';

  return (
    <div className={`game-summary game-summary-${variant}`}>
      <header className="game-summary-hero">
        <GameTitle as="p" className="game-summary-eyebrow" />
        <h1 className="game-summary-title">סיום המשחק</h1>
        {winner && (
          <p className="game-summary-winner" dir="rtl">
            המנצח: <strong><bdi>{winner.nickname}</bdi></strong>
            {' · '}
            <span className="game-summary-winner-score">
              <ScoreValue value={winner.total_score} />
              {' נק׳'}
            </span>
          </p>
        )}
      </header>

      {myScore && (
        <div className="game-summary-personal">
          <p className="game-summary-personal-rank">מקום #{myScore.rank}</p>
          <p className="game-summary-personal-score">
            <ScoreValue value={myScore.total_score} /> נקודות
          </p>
        </div>
      )}

      {funFact && <p className="fun-fact">{funFact}</p>}

      {podium.length > 0 && (
        <div
          className={`podium podium-count-${podium.length}`}
          aria-label="פודיום"
        >
          {podium.map((score) => {
            const place = podiumRaw.findIndex((s) => s.player_id === score.player_id) + 1;
            const info = findPlayer(score.player_id);
            const size = isHost
              ? place === 1
                ? 96
                : 72
              : place === 1
                ? 64
                : 48;
            return (
              <div key={score.player_id} className={`podium-place rank-${place}`}>
                <span className="podium-crown">{CROWNS[place] ?? ''}</span>
                <div className="podium-avatar-wrap">
                  <PlayerAvatar
                    nickname={score.nickname}
                    color={info?.character_color ?? '#5B8DEF'}
                    avatar={info?.avatar}
                    size={size}
                  />
                </div>
                <span className="podium-name">{score.nickname}</span>
                <span className="podium-score">
                  <ScoreValue value={score.total_score} />
                </span>
                <div className="podium-bar">{place}</div>
              </div>
            );
          })}
        </div>
      )}

      {rest.length > 0 && (
        <div className="summary-list" role="list">
          {rest.map((score, index) => {
            const place = podiumLimit + index + 1;
            const isMe = score.player_id === playerId;
            return (
              <div
                key={score.player_id}
                className={`summary-row ${isMe ? 'is-me' : ''}`}
                role="listitem"
              >
                <span className="summary-row-rank">#{place}</span>
                <span className="summary-row-name">{score.nickname}</span>
                <span className="summary-row-score">
                  <ScoreValue value={score.total_score} />
                </span>
              </div>
            );
          })}
        </div>
      )}

      {footer}
    </div>
  );
}
