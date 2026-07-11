import {
  DEFAULT_PARTY_PASS_SKU,
  PLAYER_PACK,
  freeCosmeticIds,
  type PartyPassSku,
} from '@chaos-parcel/shared';

const PASS_TOKEN_KEY = 'chaos-parcel:party-pass-token';
const OWNED_COSMETICS_KEY = 'chaos-parcel:owned-cosmetics';
const EQUIPPED_COSMETICS_KEY = 'chaos-parcel:equipped-cosmetics';

export function loadPartyPassToken(): string | null {
  try {
    return localStorage.getItem(PASS_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function savePartyPassToken(token: string): void {
  try {
    localStorage.setItem(PASS_TOKEN_KEY, token);
  } catch {
    // ignore quota / private mode
  }
}

export function clearPartyPassToken(): void {
  try {
    localStorage.removeItem(PASS_TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function loadOwnedCosmetics(): string[] {
  const free = freeCosmeticIds();
  try {
    const raw = localStorage.getItem(OWNED_COSMETICS_KEY);
    if (!raw) return free;
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) return free;
    return [...new Set([...free, ...parsed.filter((id) => typeof id === 'string')])];
  } catch {
    return free;
  }
}

export function saveOwnedCosmetics(ids: string[]): void {
  try {
    const merged = [...new Set([...freeCosmeticIds(), ...ids])];
    localStorage.setItem(OWNED_COSMETICS_KEY, JSON.stringify(merged));
  } catch {
    // ignore
  }
}

export function unlockCosmetics(ids: string[]): string[] {
  const next = [...new Set([...loadOwnedCosmetics(), ...ids])];
  saveOwnedCosmetics(next);
  return next;
}

export function loadEquippedCosmetics(): string[] {
  try {
    const raw = localStorage.getItem(EQUIPPED_COSMETICS_KEY);
    if (!raw) return ['frame_none'];
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) return ['frame_none'];
    const owned = new Set(loadOwnedCosmetics());
    const equipped = parsed.filter((id) => owned.has(id));
    return equipped.length > 0 ? equipped : ['frame_none'];
  } catch {
    return ['frame_none'];
  }
}

export function saveEquippedCosmetics(ids: string[]): void {
  try {
    localStorage.setItem(EQUIPPED_COSMETICS_KEY, JSON.stringify(ids));
  } catch {
    // ignore
  }
}

function apiBase(): string {
  return '';
}

export interface BillingStatus {
  stripe_configured: boolean;
  allow_dev_unlock: boolean;
  default_party_pass_sku: PartyPassSku;
}

export async function fetchBillingStatus(): Promise<BillingStatus> {
  const res = await fetch(`${apiBase()}/api/billing/status`);
  if (!res.ok) throw new Error('Failed to load billing status');
  return res.json() as Promise<BillingStatus>;
}

/**
 * Start Party Pass purchase via Stripe Checkout only.
 * Does not grant a pass without a completed payment.
 */
export async function startPartyPassCheckout(
  sku: PartyPassSku = DEFAULT_PARTY_PASS_SKU,
): Promise<{ url: string }> {
  const status = await fetchBillingStatus();

  if (!status.stripe_configured) {
    throw new Error(
      'תשלום לא מוגדר. הוסיפו STRIPE_SECRET_KEY (מפתח סודי מ־Stripe) ב־server/.env והפעילו מחדש.',
    );
  }

  const res = await fetch(`${apiBase()}/api/billing/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sku,
      success_path: '/host?pass=success',
      cancel_path: '/host?pass=cancel',
    }),
  });
  const data = (await res.json()) as { url?: string; error?: string; message?: string };
  if (!res.ok || !data.url) {
    throw new Error(data.message ?? data.error ?? 'לא ניתן לפתוח את דף התשלום');
  }
  return { url: data.url };
}

/** Confirm Stripe session and store pass token only when payment succeeded. */
export async function confirmStripeSession(sessionId: string): Promise<void> {
  const res = await fetch(
    `${apiBase()}/api/billing/confirm?session_id=${encodeURIComponent(sessionId)}`,
  );
  const data = (await res.json()) as {
    type?: string;
    token?: string;
    cosmetics?: string[];
    error?: string;
    message?: string;
  };
  if (!res.ok) {
    clearPartyPassToken();
    throw new Error(data.message ?? data.error ?? 'התשלום לא אומת');
  }
  if (data.type === 'party_pass' && data.token) {
    savePartyPassToken(data.token);
    return;
  }
  if (data.type === 'player_pack' && data.cosmetics) {
    unlockCosmetics(data.cosmetics);
    return;
  }
  throw new Error('תשובת תשלום לא צפויה');
}

export async function unlockPlayerPack(): Promise<string[]> {
  const status = await fetchBillingStatus();

  if (!status.stripe_configured) {
    throw new Error(
      'תשלום לא מוגדר. הוסיפו STRIPE_SECRET_KEY ב־server/.env והפעילו מחדש.',
    );
  }

  const res = await fetch(`${apiBase()}/api/billing/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sku: PLAYER_PACK.sku,
      success_path: `${window.location.pathname}?pack=success`,
      cancel_path: `${window.location.pathname}?pack=cancel`,
    }),
  });
  const data = (await res.json()) as { url?: string; error?: string; message?: string };
  if (!res.ok || !data.url) {
    throw new Error(data.message ?? data.error ?? 'לא ניתן לפתוח את דף התשלום');
  }
  window.location.href = data.url;
  return loadOwnedCosmetics();
}
