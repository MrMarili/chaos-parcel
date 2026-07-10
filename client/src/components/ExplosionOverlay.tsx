import type { PackageExplodedPayload } from '@chaos-parcel/shared';
import { ltrName } from '../host/hostGameTypes';

interface ExplosionOverlayProps {
  explosion: PackageExplodedPayload;
  playerId: string;
  onDone?: () => void;
}

export function ExplosionOverlay({ explosion, playerId, onDone }: ExplosionOverlayProps) {
  const isSelf = explosion.exploded_player_id === playerId;
  const name = ltrName(explosion.exploded_nickname);

  return (
    <div
      className={`explosion-overlay ${isSelf ? 'explosion-self' : 'explosion-other'}`}
      onAnimationEnd={onDone}
    >
      <div className="explosion-burst">💥</div>
      <p className="explosion-title">{isSelf ? 'בום! התפוצצת!' : 'בום!'}</p>
      <p className="explosion-subtitle">
        {isSelf
          ? 'החבילה התפוצצה אצלך (−50)'
          : `החבילה התפוצצה אצל ${name}`}
      </p>
      {explosion.new_holder_nickname && (
        <p className="explosion-next">
          החבילה עברה ל-{ltrName(explosion.new_holder_nickname)}
        </p>
      )}
    </div>
  );
}
