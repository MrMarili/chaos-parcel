import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  PARTY_PASS_PRODUCTS,
  PARTY_PASS_SKUS,
  type PartyPassSku,
} from '@chaos-parcel/shared';

export type PartyPassSource = 'paid' | 'dev';

export interface PartyPassClaims {
  sku: PartyPassSku;
  issuedAt: number;
  /** Unix ms; null = lifetime. */
  expiresAt: number | null;
  /** paid = Stripe; dev = explicit ALLOW_DEV_PARTY_PASS only. */
  source: PartyPassSource;
}

function secret(): string {
  return process.env.PARTY_PASS_SECRET ?? process.env.STRIPE_SECRET_KEY ?? 'chaos-parcel-dev-pass-secret';
}

function b64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return buf.toString('base64url');
}

function sign(payloadB64: string): string {
  return createHmac('sha256', secret()).update(payloadB64).digest('base64url');
}

export function issuePartyPassToken(
  sku: PartyPassSku,
  source: PartyPassSource = 'paid',
  now = Date.now(),
): string {
  const product = PARTY_PASS_PRODUCTS[sku];
  const claims: PartyPassClaims = {
    sku,
    issuedAt: now,
    expiresAt:
      product.durationDays == null
        ? null
        : now + product.durationDays * 24 * 60 * 60 * 1000,
    source,
  };
  const payloadB64 = b64url(JSON.stringify(claims));
  return `${payloadB64}.${sign(payloadB64)}`;
}

export function verifyPartyPassToken(
  token: string | undefined | null,
  now = Date.now(),
): PartyPassClaims | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadB64, signature] = parts;
  if (!payloadB64 || !signature) return null;

  const expected = sign(payloadB64);
  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }

  try {
    const json = Buffer.from(payloadB64, 'base64url').toString('utf8');
    const claims = JSON.parse(json) as PartyPassClaims;
    if (!claims?.sku || !(claims.sku in PARTY_PASS_PRODUCTS)) return null;
    if (typeof claims.issuedAt !== 'number') return null;
    if (claims.expiresAt != null && claims.expiresAt < now) return null;

    // Legacy tokens without source are treated as unpaid/dev and rejected unless
    // explicit dev unlock is enabled (blocks free upgrades from the old flow).
    const source: PartyPassSource =
      claims.source === 'paid' || claims.source === 'dev' ? claims.source : 'dev';

    if (source === 'dev' && !allowDevUnlock()) {
      return null;
    }
    if (source === 'paid' || (source === 'dev' && allowDevUnlock())) {
      return { ...claims, source };
    }
    return null;
  } catch {
    return null;
  }
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY?.startsWith('sk_'));
}

/** Free unlock is OFF by default — must set ALLOW_DEV_PARTY_PASS=true explicitly. */
export function allowDevUnlock(): boolean {
  return process.env.ALLOW_DEV_PARTY_PASS === 'true';
}

export const BILLABLE_SKUS = {
  ...PARTY_PASS_SKUS,
  player_pack: 'player_pack_starter',
} as const;

export type BillableSku =
  | PartyPassSku
  | typeof BILLABLE_SKUS.player_pack;

export function isPartyPassSku(sku: string): sku is PartyPassSku {
  return sku === PARTY_PASS_SKUS.lifetime || sku === PARTY_PASS_SKUS.monthly;
}
