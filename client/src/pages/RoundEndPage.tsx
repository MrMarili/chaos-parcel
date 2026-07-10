import type { RoundEndPayload } from '@chaos-parcel/shared';
import { RoundStandings } from '../components/RoundStandings';
import { BrandMark } from '../components/BrandMark';

interface RoundEndPageProps {
  roundEnd: RoundEndPayload;
  playerId: string;
}

export function RoundEndPage({ roundEnd, playerId }: RoundEndPageProps) {
  return (
    <div className="page round-end-page">
      <BrandMark compact />
      <RoundStandings
        round={roundEnd.round}
        scores={roundEnd.scores}
        highlightPlayerId={playerId}
      />
      <p className="status-text round-end-wait">הסיבוב הבא מתחיל בקרוב...</p>
    </div>
  );
}
