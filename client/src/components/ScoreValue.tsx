interface ScoreValueProps {
  value: number;
  className?: string;
}

/**
 * Score with forced LTR so "-" always sits to the LEFT of the digits in RTL UI,
 * and color by sign (green positive / red negative / dim zero).
 */
export function ScoreValue({ value, className = '' }: ScoreValueProps) {
  const signClass =
    value > 0 ? 'score-value--positive' : value < 0 ? 'score-value--negative' : 'score-value--zero';

  // Format explicitly — never rely on Number#toString inside an RTL parent alone.
  const digits = String(Math.abs(value));
  const sign = value < 0 ? '-' : '';

  return (
    <span
      className={`score-value ${signClass} ${className}`.trim()}
      dir="ltr"
      // bidi-override: force visual order so "-" cannot jump to the right in Hebrew UI
      style={{ direction: 'ltr', unicodeBidi: 'bidi-override' }}
    >
      {sign}
      {digits}
    </span>
  );
}
