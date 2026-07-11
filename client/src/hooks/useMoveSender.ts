import { useCallback, useEffect, useRef } from 'react';
import { MOVE_THROTTLE_MS } from '@chaos-parcel/shared';

/**
 * Sends joystick input at a steady cadence.
 * Joystick only updates a ref; a single rAF loop owns network sends
 * (including a final 0,0 on release) so movement stays smooth.
 */
export function useMoveSender(onMove: (x: number, y: number) => void) {
  const moveRef = useRef({ x: 0, y: 0 });
  const lastSentAtRef = useRef(0);
  const wasMovingRef = useRef(false);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  const setJoystick = useCallback((value: { x: number; y: number }) => {
    moveRef.current = value;
  }, []);

  useEffect(() => {
    let frameId = 0;

    const loop = (now: number) => {
      const { x, y } = moveRef.current;
      const moving = Math.abs(x) >= 0.05 || Math.abs(y) >= 0.05;

      // Stop packets bypass throttle so the character halts immediately.
      if (!moving && wasMovingRef.current) {
        onMoveRef.current(0, 0);
        lastSentAtRef.current = now;
        wasMovingRef.current = false;
      } else if (moving && now - lastSentAtRef.current >= MOVE_THROTTLE_MS) {
        onMoveRef.current(x, y);
        lastSentAtRef.current = now;
        wasMovingRef.current = true;
      }
      frameId = requestAnimationFrame(loop);
    };

    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, []);

  return setJoystick;
}
