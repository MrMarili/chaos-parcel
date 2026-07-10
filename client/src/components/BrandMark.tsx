interface BrandMarkProps {
  tagline?: string;
  compact?: boolean;
}

/** Brand lockup for "חבילה עוברת" — used on join, lobby, and host hero screens. */
export function BrandMark({ tagline, compact }: BrandMarkProps) {
  return (
    <div className={`brand-mark ${compact ? 'compact' : ''}`}>
      <span className="brand-icon-wrap" aria-hidden="true">
        📦
      </span>
      <h1 className="brand-title">חבילה עוברת</h1>
      {tagline && <p className="brand-tagline">{tagline}</p>}
    </div>
  );
}
