import { useEffect } from 'react';
import confetti from 'canvas-confetti';

const PARTY_COLORS = ['#f5b942', '#ff5a36', '#7cff6b', '#4da3ff', '#ffffff', '#ffd27a'];

export type ConfettiIntensity = 'host' | 'phone';

/**
 * Celebration confetti on mount — big side cannons on the TV host,
 * a lighter burst on phones.
 */
export function useConfettiCelebration(active = true, intensity: ConfettiIntensity = 'phone') {
  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    const isHost = intensity === 'host';

    const fire = (opts: confetti.Options) => {
      if (cancelled) return;
      confetti({
        colors: PARTY_COLORS,
        disableForReducedMotion: true,
        ...opts,
      });
    };

    // Opening burst from the center
    fire({
      particleCount: isHost ? 120 : 70,
      spread: isHost ? 90 : 70,
      startVelocity: isHost ? 55 : 42,
      origin: { x: 0.5, y: 0.4 },
    });

    const durationMs = isHost ? 4200 : 2800;
    const endAt = Date.now() + durationMs;
    const tickMs = isHost ? 350 : 450;

    const interval = setInterval(() => {
      if (cancelled || Date.now() > endAt) {
        clearInterval(interval);
        return;
      }
      fire({
        particleCount: isHost ? 36 : 22,
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.65 },
        startVelocity: isHost ? 48 : 36,
      });
      fire({
        particleCount: isHost ? 36 : 22,
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.65 },
        startVelocity: isHost ? 48 : 36,
      });
    }, tickMs);

    return () => {
      cancelled = true;
      clearInterval(interval);
      confetti.reset();
    };
  }, [active, intensity]);
}
