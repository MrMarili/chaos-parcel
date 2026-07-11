import { useEffect, useRef, useState } from 'react';
import type { AbilityType, CooldownState, PackageExplodedPayload } from '@chaos-parcel/shared';
import { DynamicJoystick } from '../components/DynamicJoystick';
import { AbilityBar } from '../components/AbilityBar';
import { PanicOverlay } from '../components/PanicOverlay';
import { ExplosionOverlay } from '../components/ExplosionOverlay';
import { useMoveSender } from '../hooks/useMoveSender';
import { ABILITY_LABELS } from '../config';
import { ABILITY_DESCRIPTIONS } from '../host/hostGameTypes';
import { EXPLOSION_DISPLAY_MS } from '../host/hostGameTypes';
import { warmHaptics } from '../utils/haptics';

interface GamePageProps {
  playerId: string;
  hasPackage: boolean;
  canPass: boolean;
  round: number;
  timerSeconds?: number;
  cooldowns: CooldownState;
  explosion: PackageExplodedPayload | null;
  onExplosionDone: () => void;
  onMove: (x: number, y: number) => void;
  onAbility: (ability: AbilityType) => void;
  onPass: () => void;
}

const ABILITY_COOLDOWNS: Record<AbilityType, number> = {
  FREEZE: 12,
  SHOCKWAVE: 8,
  MAGNET: 15,
  CONFUSION: 10,
};

export function GamePage({
  playerId,
  hasPackage,
  canPass,
  round,
  timerSeconds,
  cooldowns: serverCooldowns,
  explosion,
  onExplosionDone,
  onMove,
  onAbility,
  onPass,
}: GamePageProps) {
  const [localCooldowns, setLocalCooldowns] = useState<CooldownState>(serverCooldowns);
  const [showHelp, setShowHelp] = useState(false);
  const [visibleExplosion, setVisibleExplosion] = useState<PackageExplodedPayload | null>(null);
  const explosionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleJoystickChange = useMoveSender(onMove);

  // Prepare iOS Taptic switch on first touch (must exist before panic pulses).
  useEffect(() => {
    const warm = () => {
      warmHaptics();
      window.removeEventListener('pointerdown', warm);
    };
    window.addEventListener('pointerdown', warm, { passive: true });
    return () => window.removeEventListener('pointerdown', warm);
  }, []);

  useEffect(() => {
    if (!explosion) return;
    setVisibleExplosion(explosion);
    if (explosionTimerRef.current) clearTimeout(explosionTimerRef.current);
    explosionTimerRef.current = setTimeout(() => {
      setVisibleExplosion(null);
      onExplosionDone();
    }, EXPLOSION_DISPLAY_MS);
    return () => {
      if (explosionTimerRef.current) clearTimeout(explosionTimerRef.current);
    };
  }, [explosion, onExplosionDone]);

  useEffect(() => {
    setLocalCooldowns((prev) => ({ ...prev, ...serverCooldowns }));
  }, [serverCooldowns]);

  useEffect(() => {
    const interval = setInterval(() => {
      setLocalCooldowns((prev) => {
        const next = { ...prev };
        let changed = false;
        (Object.keys(next) as AbilityType[]).forEach((key) => {
          if (next[key] > 0) {
            next[key] = Math.max(0, next[key] - 0.1);
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 100);
    return () => clearInterval(interval);
  }, []);

  const handleAbility = (ability: AbilityType) => {
    onAbility(ability);
    setLocalCooldowns((prev) => ({
      ...prev,
      [ability]: ABILITY_COOLDOWNS[ability],
    }));
  };

  return (
    <div className={`game-layout ${hasPackage ? 'is-panic' : ''}`}>
      <div className="game-top">
        {!hasPackage && (
          <>
            <p className="game-help">
              יכולות כאוס — השפעה על שחקנים בזירה (במסך הראשי)
            </p>
            <AbilityBar
              cooldowns={localCooldowns}
              onAbility={handleAbility}
              disabled={hasPackage}
            />
            <div className="ability-help">
              <button
                type="button"
                className="ability-help-toggle"
                onClick={() => setShowHelp((v) => !v)}
              >
                {showHelp ? 'הסתר' : 'מה כל כפתור עושה?'}
              </button>
              {showHelp && (
                <ul>
                  {(Object.keys(ABILITY_LABELS) as AbilityType[]).map((key) => (
                    <li key={key}>
                      <strong>{ABILITY_LABELS[key]}:</strong> {ABILITY_DESCRIPTIONS[key]}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
        <div className="round-banner">סיבוב {round}/5</div>
      </div>

      <DynamicJoystick onChange={handleJoystickChange} />
      {!hasPackage && (
        <p className="joystick-hint">גע למטה כדי להזיז את הדמות שלך בזירה</p>
      )}

      <PanicOverlay
        active={hasPackage}
        canPass={canPass}
        onPass={onPass}
        timerSeconds={timerSeconds}
      />

      {visibleExplosion && (
        <ExplosionOverlay
          explosion={visibleExplosion}
          playerId={playerId}
          onDone={() => {
            setVisibleExplosion(null);
            onExplosionDone();
          }}
        />
      )}

      <span style={{ display: 'none' }} data-player-id={playerId} />
    </div>
  );
}
