import { describe, expect, it } from 'vitest';
import { colorDistance, pickDistinctColor } from './playerColor.js';

describe('pickDistinctColor', () => {
  it('returns a valid hex color', () => {
    const color = pickDistinctColor([]);
    expect(color).toMatch(/^#[0-9A-F]{6}$/);
  });

  it('stays far from existing colors', () => {
    const existing = ['#FF0000', '#00FF00', '#0000FF'];
    for (let i = 0; i < 20; i++) {
      const next = pickDistinctColor(existing);
      for (const c of existing) {
        expect(colorDistance(next, c)).toBeGreaterThanOrEqual(80);
      }
    }
  });

  it('reuses preferred color when free', () => {
    const preferred = '#AABBCC';
    expect(pickDistinctColor(['#FF0000'], undefined, undefined, preferred)).toBe(preferred);
  });

  it('skips preferred color when too close to an existing one', () => {
    const preferred = '#FF0000';
    const next = pickDistinctColor([preferred], undefined, undefined, preferred);
    expect(next).not.toBe(preferred);
  });
});
