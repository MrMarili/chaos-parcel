import { useEffect } from 'react';
import type { CSSProperties } from 'react';
import { pulseHaptic, pulseHapticFromGesture, stopHaptic, warmHaptics } from '../utils/haptics';

interface PanicOverlayProps {
  active: boolean;
  timerSeconds?: number;
}

interface PanicStyle extends CSSProperties {
  '--panic-speed'?: string;
}

const HAPTIC_INTERVAL_MS = 550;

/** Visual + haptic panic while holding the package (pass lives in AbilityBar). */
export function PanicOverlay({ active, timerSeconds }: PanicOverlayProps) {
  useEffect(() => {
    if (!active) return;

    warmHaptics();
    pulseHaptic();

    // Best-effort loop (works on Android; iOS often needs a real gesture — see below).
    const interval = setInterval(() => {
      pulseHaptic();
    }, HAPTIC_INTERVAL_MS);

    // iPhone: Taptic only fires reliably inside a user-gesture chain.
    // While holding the package the player is usually on the joystick — pulse from those events.
    const onPointer = () => {
      pulseHapticFromGesture(480);
    };
    document.addEventListener('pointerdown', onPointer, { passive: true });
    document.addEventListener('pointermove', onPointer, { passive: true });

    return () => {
      clearInterval(interval);
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('pointermove', onPointer);
      stopHaptic();
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
    </div>
  );
}
