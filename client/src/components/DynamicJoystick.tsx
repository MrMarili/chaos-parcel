import { useCallback, useEffect, useRef, useState } from 'react';

interface JoystickValue {
  x: number;
  y: number;
}

interface DynamicJoystickProps {
  onChange: (value: JoystickValue) => void;
  disabled?: boolean;
}

const STICK_RADIUS = 36;
const BASE_RADIUS = 60;

export function DynamicJoystick({ onChange, disabled }: DynamicJoystickProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [basePos, setBasePos] = useState({ x: 0, y: 0 });
  const [stickOffset, setStickOffset] = useState({ x: 0, y: 0 });
  const pointerIdRef = useRef<number | null>(null);

  const updateStick = useCallback(
    (clientX: number, clientY: number) => {
      const dx = clientX - basePos.x;
      const dy = clientY - basePos.y;
      const distance = Math.hypot(dx, dy);
      const clampedDistance = Math.min(distance, BASE_RADIUS);
      const angle = Math.atan2(dy, dx);
      const offsetX = Math.cos(angle) * clampedDistance;
      const offsetY = Math.sin(angle) * clampedDistance;

      setStickOffset({ x: offsetX, y: offsetY });
      onChange({
        x: offsetX / BASE_RADIUS,
        y: offsetY / BASE_RADIUS,
      });
    },
    [basePos.x, basePos.y, onChange],
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    const rect = areaRef.current?.getBoundingClientRect();
    if (!rect) return;

    pointerIdRef.current = e.pointerId;
    areaRef.current?.setPointerCapture(e.pointerId);
    setActive(true);
    setBasePos({ x: e.clientX, y: e.clientY });
    setStickOffset({ x: 0, y: 0 });
    onChange({ x: 0, y: 0 });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!active || pointerIdRef.current !== e.pointerId) return;
    updateStick(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (pointerIdRef.current !== e.pointerId) return;
    pointerIdRef.current = null;
    setActive(false);
    setStickOffset({ x: 0, y: 0 });
    onChange({ x: 0, y: 0 });
  };

  useEffect(() => {
    if (disabled && active) {
      setActive(false);
      setStickOffset({ x: 0, y: 0 });
      onChange({ x: 0, y: 0 });
    }
  }, [disabled, active, onChange]);

  return (
    <div
      ref={areaRef}
      className="game-bottom"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{ touchAction: 'none' }}
    >
      {active && (
        <>
          <div
            className="joystick-base"
            style={{ left: basePos.x, top: basePos.y, position: 'fixed' }}
          />
          <div
            className="joystick-stick"
            style={{
              position: 'fixed',
              left: basePos.x + stickOffset.x,
              top: basePos.y + stickOffset.y,
              width: STICK_RADIUS,
              height: STICK_RADIUS,
            }}
          />
        </>
      )}
      {!active && (
        <p className="status-text joystick-idle-hint">גע כדי להזיז</p>
      )}
    </div>
  );
}
