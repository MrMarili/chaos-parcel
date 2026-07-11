import { describe, expect, it } from 'vitest';
import {
  COSMETIC_CATALOG,
  DEFAULT_PARTY_PASS_SKU,
  PARTY_PASS_PRODUCTS,
  PARTY_PASS_SKUS,
  PLAYER_PACK,
  freeCosmeticIds,
  getCosmeticById,
  isValidCosmeticId,
} from './monetization.js';

describe('monetization catalog', () => {
  it('defines lifetime and monthly party pass SKUs', () => {
    expect(PARTY_PASS_PRODUCTS[PARTY_PASS_SKUS.lifetime].priceIls).toBeGreaterThan(0);
    expect(PARTY_PASS_PRODUCTS[PARTY_PASS_SKUS.monthly].durationDays).toBe(30);
    expect(DEFAULT_PARTY_PASS_SKU).toBe(PARTY_PASS_SKUS.lifetime);
  });

  it('keeps at least one free cosmetic', () => {
    expect(freeCosmeticIds().length).toBeGreaterThan(0);
    expect(getCosmeticById('frame_none')?.free).toBe(true);
  });

  it('player pack only references catalog cosmetics', () => {
    for (const id of PLAYER_PACK.includes) {
      expect(isValidCosmeticId(id)).toBe(true);
      expect(getCosmeticById(id)?.free).toBe(false);
    }
  });

  it('rejects unknown cosmetic ids', () => {
    expect(isValidCosmeticId('nope')).toBe(false);
    expect(COSMETIC_CATALOG.every((c) => isValidCosmeticId(c.id))).toBe(true);
  });
});
