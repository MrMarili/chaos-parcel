/** Monetization catalog — Party Pass, cosmetics, and ad placement rules. */

export const PARTY_PASS_SKUS = {
  lifetime: 'party_pass_lifetime',
  monthly: 'party_pass_monthly',
} as const;

export type PartyPassSku = (typeof PARTY_PASS_SKUS)[keyof typeof PARTY_PASS_SKUS];

export interface PartyPassProduct {
  sku: PartyPassSku;
  nameHe: string;
  descriptionHe: string;
  /** Display price in ILS (UI only — Stripe amounts live server-side). */
  priceIls: number;
  /** Null = never expires. */
  durationDays: number | null;
  benefits: string[];
}

export const PARTY_PASS_PRODUCTS: Record<PartyPassSku, PartyPassProduct> = {
  [PARTY_PASS_SKUS.lifetime]: {
    sku: PARTY_PASS_SKUS.lifetime,
    nameHe: 'Party Pass',
    descriptionHe: 'שדרגו את המסיבה — בלי פרסומות לכל החדר, ערכות נושא ומצבי משחק.',
    priceIls: 49,
    durationDays: null,
    benefits: [
      'הסרת פרסומות לכל השחקנים בחדר',
      'ערכת נושא לזירה ולחבילה',
      'מצב מהיר + מצב כאוס',
      'היסטוריית מסיבות מורחבת',
    ],
  },
  [PARTY_PASS_SKUS.monthly]: {
    sku: PARTY_PASS_SKUS.monthly,
    nameHe: 'Party Pass חודשי',
    descriptionHe: 'אותן הטבות ל-30 יום — מושלם למסיבות תכופות.',
    priceIls: 19,
    durationDays: 30,
    benefits: [
      'הסרת פרסומות לכל השחקנים בחדר',
      'ערכת נושא לזירה ולחבילה',
      'מצב מהיר + מצב כאוס',
    ],
  },
};

/** Default host SKU promoted in upsells. */
export const DEFAULT_PARTY_PASS_SKU: PartyPassSku = PARTY_PASS_SKUS.lifetime;

export const COSMETIC_TYPES = ['frame', 'trail', 'join_effect'] as const;
export type CosmeticType = (typeof COSMETIC_TYPES)[number];

export interface CosmeticProduct {
  id: string;
  type: CosmeticType;
  nameHe: string;
  /** CSS accent used in previews. */
  accent: string;
  priceIls: number;
  /** Free cosmetics are always unlocked. */
  free: boolean;
}

export const COSMETIC_CATALOG: CosmeticProduct[] = [
  {
    id: 'frame_none',
    type: 'frame',
    nameHe: 'ללא מסגרת',
    accent: 'transparent',
    priceIls: 0,
    free: true,
  },
  {
    id: 'frame_gold',
    type: 'frame',
    nameHe: 'מסגרת זהב',
    accent: '#E8B84A',
    priceIls: 9,
    free: false,
  },
  {
    id: 'frame_neon',
    type: 'frame',
    nameHe: 'מסגרת ניאון',
    accent: '#3DDC97',
    priceIls: 9,
    free: false,
  },
  {
    id: 'trail_spark',
    type: 'trail',
    nameHe: 'שביל ניצוצות',
    accent: '#FF8C66',
    priceIls: 12,
    free: false,
  },
  {
    id: 'trail_smoke',
    type: 'trail',
    nameHe: 'שביל עשן',
    accent: '#8B9BB4',
    priceIls: 12,
    free: false,
  },
  {
    id: 'join_confetti',
    type: 'join_effect',
    nameHe: 'כניסת קונפטי',
    accent: '#F45B69',
    priceIls: 7,
    free: false,
  },
  {
    id: 'join_boom',
    type: 'join_effect',
    nameHe: 'כניסת בום',
    accent: '#FF6B35',
    priceIls: 7,
    free: false,
  },
];

export const PLAYER_PACK_SKU = 'player_pack_starter';

export interface PlayerPackProduct {
  sku: typeof PLAYER_PACK_SKU;
  nameHe: string;
  descriptionHe: string;
  priceIls: number;
  /** Cosmetic IDs unlocked by this pack. */
  includes: string[];
}

export const PLAYER_PACK: PlayerPackProduct = {
  sku: PLAYER_PACK_SKU,
  nameHe: 'Player Pack',
  descriptionHe: 'מסגרת זהב, שביל ניצוצות וכניסת קונפטי.',
  priceIls: 19,
  includes: ['frame_gold', 'trail_spark', 'join_confetti'],
};

export const AD_SLOTS = [
  'host_lobby',
  'host_arena',
  'host_round_end',
  'host_summary',
  'phone_join',
  'phone_lobby',
  'phone_round_end',
  'phone_summary',
] as const;

export type AdSlotId = (typeof AD_SLOTS)[number];

/** Phone phases where ads must not interrupt joystick / panic. */
export const AD_FORBIDDEN_PHASES = ['playing_phone'] as const;

export function getCosmeticById(id: string): CosmeticProduct | undefined {
  return COSMETIC_CATALOG.find((c) => c.id === id);
}

export function freeCosmeticIds(): string[] {
  return COSMETIC_CATALOG.filter((c) => c.free).map((c) => c.id);
}

export function isValidCosmeticId(id: string): boolean {
  return COSMETIC_CATALOG.some((c) => c.id === id);
}
