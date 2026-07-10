import { useEffect } from 'react';
import type { CSSProperties } from 'react';

interface PanicOverlayProps {
  active: boolean;
  onPass: () => void;
  timerSeconds?: number;
}

interface PanicStyle extends CSSProperties {
  '--panic-speed'?: string;
}

const VIBRATE_PATTERN = [100, 50, 100, 50, 100, 50];

export function PanicOverlay({ active, onPass, timerSeconds }: PanicOverlayProps) {
  useEffect(() => {
    if (!active || !navigator.vibrate) return;

    const interval = setInterval(() => {
      navigator.vibrate(VIBRATE_PATTERN);
    }, 600);

    return () => {
      clearInterval(interval);
      navigator.vibrate(0);
    };
  }, [active]);

  if (!active) return null;

  // Flashing speeds up as the fuse burns down, if a timer is provided.
  const panicSpeed =
    timerSeconds !== undefined ? `${Math.max(0.15, Math.min(0.6, timerSeconds / 15))}s` : '0.5s';

  return (
    <div className="panic-overlay active" style={{ '--panic-speed': panicSpeed } as PanicStyle}>
      <div className="panic-flash-bg" />
      <div className="panic-border-pulse" />
      <div className="panic-content">
        <p className="panic-title">יש לך את החבילה! 📦</p>
        {timerSeconds !== undefined && (
          <p className="panic-timer">{timerSeconds.toFixed(1)}s</p>
        )}
        <button type="button" className="pass-btn" onClick={onPass}>
          למסור! (PASS)
        </button>
      </div>
    </div>
  );
}
