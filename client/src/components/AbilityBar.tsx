import type { AbilityType, CooldownState } from '@chaos-parcel/shared';
import { ABILITY_ICONS, ABILITY_LABELS } from '../config';

interface AbilityBarProps {
  cooldowns: CooldownState;
  onAbility: (ability: AbilityType) => void;
  disabled?: boolean;
}

const ABILITIES: AbilityType[] = ['FREEZE', 'SHOCKWAVE', 'MAGNET', 'CONFUSION'];

const ABILITY_CLASS: Record<AbilityType, string> = {
  FREEZE: 'freeze',
  SHOCKWAVE: 'shockwave',
  MAGNET: 'magnet',
  CONFUSION: 'confusion',
};

export function AbilityBar({ cooldowns, onAbility, disabled }: AbilityBarProps) {
  const activeAbility = ABILITIES.find((ability) => cooldowns[ability] > 0) ?? null;

  return (
    <div className="ability-bar">
      {ABILITIES.map((ability) => {
        const remaining = Math.ceil(cooldowns[ability]);
        const isActive = activeAbility === ability;
        // Only the running ability is locked; others stay tappable to replace it.
        const locked = isActive;

        return (
          <button
            key={ability}
            type="button"
            className={`ability-btn ${ABILITY_CLASS[ability]}${isActive ? ' is-active' : ''}`}
            disabled={disabled || locked}
            onClick={() => onAbility(ability)}
          >
            <span className="ability-icon">{ABILITY_ICONS[ability]}</span>
            <span className="ability-label">{ABILITY_LABELS[ability]}</span>
            {isActive && (
              <span className="cooldown-overlay">
                <span className="cooldown-hourglass">⏳</span>
                <span className="cooldown-seconds">{remaining}s</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
