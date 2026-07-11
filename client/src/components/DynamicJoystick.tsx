import { useCallback, useEffect, useRef, useState } from 'react';

interface JoystickValue {
  x: number;
  y: number;
}

interface DynamicJoystickProps {
  onChange: (value: JoystickValue) => void;
  disabled?: boolean;
  className?: string;
}

const STICK_RADIUS = 40;
const BASE_RADIUS = 64;
const DEADZONE = 0.08;

/**
 * Dynamic joystick — all geometry is ref-based so the first finger moves
 * after touch-down are never computed against a stale React base position.
 */
export function DynamicJoystick({ onChange, disabled, className }: DynamicJoystickProps) {
  const areaRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef({ x: 0, y: 0 });
  const activeRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const [visual, setVisual] = useState<{
    active: boolean;
    baseX: number;
    baseY: number;
    stickX: number;
    stickY: number;
  }>({ active: false, baseX: 0, baseY: 0, stickX: 0, stickY: 0 });

  const emit = useCallback((offsetX: number, offsetY: number) => {
    let x = offsetX / BASE_RADIUS;
    let y = offsetY / BASE_RADIUS;
    const mag = Math.hypot(x, y);
    if (mag < DEADZONE) {
      onChangeRef.current({ x: 0, y: 0 });
      return;
    }
    // Remap deadzone → full range so small pushes still feel responsive.
    const scaled = Math.min(1, (mag - DEADZONE) / (1 - DEADZONE));
    x = (x / mag) * scaled;
    y = (y / mag) * scaled;
    onChangeRef.current({ x, y });
  }, []);

  const updateFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const dx = clientX - baseRef.current.x;
      const dy = clientY - baseRef.current.y;
      const distance = Math.hypot(dx, dy);
      const clamped = Math.min(distance, BASE_RADIUS);
      const angle = Math.atan2(dy, dx);
      const offsetX = Math.cos(angle) * clamped;
      const offsetY = Math.sin(angle) * clamped;

      setVisual((prev) => ({
        ...prev,
        stickX: offsetX,
        stickY: offsetY,
      }));
      emit(offsetX, offsetY);
    },
    [emit],
  );

  const handlePointerDown = (e: React.PointerEvent) => {
    if (disabled) return;
    e.preventDefault();
    areaRef.current?.setPointerCapture(e.pointerId);
    pointerIdRef.current = e.pointerId;
    activeRef.current = true;
    baseRef.current = { x: e.clientX, y: e.clientY };
    setVisual({
      active: true,
      baseX: e.clientX,
      baseY: e.clientY,
      stickX: 0,
      stickY: 0,
    });
    onChangeRef.current({ x: 0, y: 0 });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!activeRef.current || pointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    updateFromPointer(e.clientX, e.clientY);
  };

  const endPointer = (e: React.PointerEvent) => {
    if (pointerIdRef.current !== e.pointerId) return;
    pointerIdRef.current = null;
    activeRef.current = false;
    setVisual((prev) => ({ ...prev, active: false, stickX: 0, stickY: 0 }));
    onChangeRef.current({ x: 0, y: 0 });
  };

  useEffect(() => {
    if (disabled && activeRef.current) {
      activeRef.current = false;
      pointerIdRef.current = null;
      setVisual((prev) => ({ ...prev, active: false, stickX: 0, stickY: 0 }));
      onChangeRef.current({ x: 0, y: 0 });
    }
  }, [disabled]);

  return (
    <div
      ref={areaRef}
      className={className ?? 'game-bottom'}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
      style={{ touchAction: 'none' }}
    >
      {visual.active && (
        <>
          <div
            className="joystick-base"
            style={{ left: visual.baseX, top: visual.baseY, position: 'fixed' }}
          />
          <div
            className="joystick-stick"
            style={{
              position: 'fixed',
              left: visual.baseX + visual.stickX,
              top: visual.baseY + visual.stickY,
              width: STICK_RADIUS,
              height: STICK_RADIUS,
            }}
          />
        </>
      )}
      {!visual.active && (
        <p className="status-text joystick-idle-hint">גע כדי להזיז</p>
      )}
    </div>
  );
}
