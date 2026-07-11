import { GameTitle } from './GameTitle';

interface BrandMarkProps {
  tagline?: string;
  compact?: boolean;
}

/** Brand lockup for "חבילה מתפוצצת" — used on join, lobby, and host hero screens. */
export function BrandMark({ tagline, compact }: BrandMarkProps) {
  return (
    <div className={`brand-mark ${compact ? 'compact' : ''}`}>
      <span className="brand-icon-wrap" aria-hidden="true">
        📦
      </span>
      <GameTitle className="brand-title" />
      {tagline && <p className="brand-tagline">{tagline}</p>}
    </div>
  );
}
