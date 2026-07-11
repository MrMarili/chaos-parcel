import type { AdSlotId } from '@chaos-parcel/shared';

interface AdSlotProps {
  slot: AdSlotId;
  /** When false, render nothing. */
  enabled?: boolean;
  variant?: 'banner' | 'sponsor' | 'compact';
  className?: string;
}

const COPY: Record<AdSlotId, { title: string; body: string }> = {
  host_lobby: {
    title: 'מקום לפרסומת',
    body: 'באנר שותפים ליד ה־QR — לא מכסה את הקוד.',
  },
  host_arena: {
    title: 'מקום לפרסומת',
    body: 'באנר מתחת לזירה בזמן המשחק.',
  },
  host_round_end: {
    title: 'מקום לפרסומת',
    body: 'באנר קצר בין סיבובים.',
  },
  host_summary: {
    title: 'מקום לפרסומת',
    body: 'באנר אחרי הפודיום, לפני משחק חדש.',
  },
  phone_join: {
    title: 'מקום לפרסומת',
    body: 'באנר במסך ההצטרפות.',
  },
  phone_lobby: {
    title: 'מקום לפרסומת',
    body: 'באנר בזמן ההמתנה להתחלה.',
  },
  phone_round_end: {
    title: 'מקום לפרסומת',
    body: 'באנר בין סיבובים בטלפון.',
  },
  phone_summary: {
    title: 'מקום לפרסומת',
    body: 'באנר במסך הסיכום.',
  },
};

/**
 * Soft house-ad / sponsor slot placeholder.
 * When a real ad network is wired later, swap the inner content only.
 */
export function AdSlot({
  slot,
  enabled = true,
  variant = 'banner',
  className = '',
}: AdSlotProps) {
  if (!enabled) return null;

  const copy = COPY[slot];
  return (
    <aside
      className={`ad-slot ad-slot--${variant} ${className}`.trim()}
      aria-label="פרסומת"
      data-ad-slot={slot}
    >
      <p className="ad-slot-kicker">מודעה</p>
      <p className="ad-slot-title">{copy.title}</p>
      <p className="ad-slot-body">{copy.body}</p>
    </aside>
  );
}
