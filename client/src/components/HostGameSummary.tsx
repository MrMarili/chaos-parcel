import type { GameEndPayload, PlayerInfo } from '@chaos-parcel/shared';
import { GameSummary } from './GameSummary';
import { useConfettiCelebration } from '../hooks/useConfettiCelebration';
import { AdSlot } from './AdSlot';

interface HostGameSummaryProps {
  gameEnd: GameEndPayload;
  players: PlayerInfo[];
  onNewGame: () => void;
  onBackToLobby: () => void;
}

/** Full-screen TV finale — podium, standings, confetti. */
export function HostGameSummary({
  gameEnd,
  players,
  onNewGame,
  onBackToLobby,
}: HostGameSummaryProps) {
  useConfettiCelebration(true, 'host');

  return (
    <div className="page host-page host-summary-page">
      <GameSummary
        gameEnd={gameEnd}
        players={players}
        variant="host"
        footer={
          <div className="host-summary-actions">
            <AdSlot slot="host_summary" variant="banner" />
            <button type="button" className="btn-primary host-summary-btn" onClick={onNewGame}>
              משחק חדש
            </button>
            <button type="button" className="btn-secondary host-summary-btn" onClick={onBackToLobby}>
              חזרה למסך הראשי
            </button>
          </div>
        }
      />
    </div>
  );
}
