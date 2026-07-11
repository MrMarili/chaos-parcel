import { useMemo, useState } from 'react';
import { COSMETIC_CATALOG, type CosmeticType } from '@chaos-parcel/shared';
import {
  loadEquippedCosmetics,
  saveEquippedCosmetics,
} from '../monetization/storage';

interface CosmeticPickerProps {
  onChange?: (equipped: string[]) => void;
  className?: string;
}

const TYPE_LABELS: Record<CosmeticType, string> = {
  frame: 'מסגרת',
  trail: 'שביל',
  join_effect: 'כניסה',
};

/** All catalog cosmetics are free while payments are paused. */
export function CosmeticPicker({ onChange, className = '' }: CosmeticPickerProps) {
  const [equipped, setEquipped] = useState(() => loadEquippedCosmetics());

  const byType = useMemo(() => {
    const map: Record<CosmeticType, typeof COSMETIC_CATALOG> = {
      frame: [],
      trail: [],
      join_effect: [],
    };
    for (const item of COSMETIC_CATALOG) {
      map[item.type].push(item);
    }
    return map;
  }, []);

  const toggleEquip = (id: string, type: CosmeticType) => {
    const next = equipped.filter((eid) => {
      const item = COSMETIC_CATALOG.find((c) => c.id === eid);
      return item && item.type !== type;
    });
    next.push(id);
    setEquipped(next);
    saveEquippedCosmetics(next);
    onChange?.(next);
  };

  return (
    <div className={`cosmetic-picker ${className}`.trim()}>
      <p className="section-label">קוסמטיקה</p>
      <p className="status-text cosmetic-picker-hint">
        רק מראה — לא משפיע על יכולות או ניקוד
      </p>

      {(Object.keys(byType) as CosmeticType[]).map((type) => (
        <div key={type} className="cosmetic-picker-group">
          <p className="cosmetic-picker-type">{TYPE_LABELS[type]}</p>
          <div className="cosmetic-picker-row">
            {byType[type].map((item) => {
              const isEquipped = equipped.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  className={`cosmetic-chip ${isEquipped ? 'is-equipped' : ''}`}
                  style={{ ['--cosmetic-accent' as string]: item.accent }}
                  onClick={() => toggleEquip(item.id, item.type)}
                  title={item.nameHe}
                >
                  <span className="cosmetic-chip-swatch" />
                  <span className="cosmetic-chip-name">{item.nameHe}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
