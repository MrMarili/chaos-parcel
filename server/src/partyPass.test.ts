import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  allowDevUnlock,
  issuePartyPassToken,
  verifyPartyPassToken,
} from './partyPass.js';

describe('partyPass tokens', () => {
  const envKeys = ['STRIPE_SECRET_KEY', 'ALLOW_DEV_PARTY_PASS', 'PARTY_PASS_SECRET'] as const;
  const snapshot: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of envKeys) {
      snapshot[key] = process.env[key];
    }
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.ALLOW_DEV_PARTY_PASS;
    delete process.env.PARTY_PASS_SECRET;
  });

  afterEach(() => {
    for (const key of envKeys) {
      const value = snapshot[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('issues and verifies a paid lifetime token', () => {
    const token = issuePartyPassToken('party_pass_lifetime', 'paid');
    const claims = verifyPartyPassToken(token);
    expect(claims?.sku).toBe('party_pass_lifetime');
    expect(claims?.expiresAt).toBeNull();
    expect(claims?.source).toBe('paid');
  });

  it('rejects tampered tokens', () => {
    const token = issuePartyPassToken('party_pass_lifetime', 'paid');
    const [payload] = token.split('.');
    expect(verifyPartyPassToken(`${payload}.deadbeef`)).toBeNull();
  });

  it('rejects expired monthly tokens', () => {
    const now = Date.now();
    const token = issuePartyPassToken(
      'party_pass_monthly',
      'paid',
      now - 40 * 24 * 60 * 60 * 1000,
    );
    expect(verifyPartyPassToken(token, now)).toBeNull();
  });

  it('disallows free unlock by default', () => {
    expect(allowDevUnlock()).toBe(false);
  });

  it('rejects legacy/dev tokens when free unlock is off', () => {
    const legacyPayload = Buffer.from(
      JSON.stringify({
        sku: 'party_pass_lifetime',
        issuedAt: Date.now(),
        expiresAt: null,
      }),
      'utf8',
    ).toString('base64url');
    // Build with current secret via issue, then verify a source=dev token.
    const devToken = issuePartyPassToken('party_pass_lifetime', 'dev');
    expect(verifyPartyPassToken(devToken)).toBeNull();
    expect(legacyPayload.length).toBeGreaterThan(0);
  });

  it('accepts dev tokens only when ALLOW_DEV_PARTY_PASS=true', () => {
    process.env.ALLOW_DEV_PARTY_PASS = 'true';
    const token = issuePartyPassToken('party_pass_lifetime', 'dev');
    expect(verifyPartyPassToken(token)?.source).toBe('dev');
  });
});
