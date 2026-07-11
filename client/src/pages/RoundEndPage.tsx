import type { RoundEndPayload } from '@chaos-parcel/shared';
import { RoundStandings } from '../components/RoundStandings';
import { BrandMark } from '../components/BrandMark';
import { AdSlot } from '../components/AdSlot';

interface RoundEndPageProps {
  roundEnd: RoundEndPayload;
  playerId: string;
  /** True if this player held the package when the round ended. */
  wasHoldingPackage?: boolean;
}

export function RoundEndPage({
  roundEnd,
  playerId,
  wasHoldingPackage,
}: RoundEndPageProps) {
  const me = roundEnd.scores.find((s) => s.player_id === playerId);
  const personalMessage = me?.had_explosion
    ? '💥 הסיבוב נגמר — החבילה התפוצצה אצלך בסיבוב הזה'
    : wasHoldingPackage
      ? '📦 הסיבוב נגמר כשהחבילה הייתה אצלך — נשמת לרווחה!'
      : me?.survived
        ? '✓ שרדת את הסיבוב בלי פיצוץ'
        : null;

  return (
    <div className="page round-end-page">
      <BrandMark compact />

      {personalMessage && (
        <div
          className={`round-end-personal ${me?.had_explosion ? 'is-boom' : wasHoldingPackage ? 'is-holder' : 'is-safe'}`}
          role="status"
        >
          {personalMessage}
        </div>
      )}

      <RoundStandings
        round={roundEnd.round}
        scores={roundEnd.scores}
        highlightPlayerId={playerId}
      />
      <AdSlot slot="phone_round_end" variant="banner" />
      <p className="status-text round-end-wait">הסיבוב הבא מתחיל בקרוב...</p>
    </div>
  );
}
