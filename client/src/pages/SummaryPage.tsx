import type { GameEndPayload, PlayerInfo } from '@chaos-parcel/shared';
import { GameSummary } from '../components/GameSummary';
import { useConfettiCelebration } from '../hooks/useConfettiCelebration';
import { AdSlot } from '../components/AdSlot';

interface SummaryPageProps {
  gameEnd: GameEndPayload;
  playerId: string;
  players: PlayerInfo[];
}

export function SummaryPage({ gameEnd, playerId, players }: SummaryPageProps) {
  useConfettiCelebration(true, 'phone');

  return (
    <div className="page summary-page">
      <GameSummary
        gameEnd={gameEnd}
        players={players}
        variant="phone"
        playerId={playerId}
        footer={
          <div className="summary-phone-footer">
            <AdSlot slot="phone_summary" variant="banner" />
            <p className="status-text">ממתין למשחק חדש מהמסך הראשי...</p>
          </div>
        }
      />
    </div>
  );
}
