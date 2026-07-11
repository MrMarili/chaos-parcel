import { describe, expect, it } from 'vitest';
import { upsertDeviceProfile, getDeviceProfile } from './deviceProfileStore.js';

describe('deviceProfileStore', () => {
  it('upserts and returns a profile', () => {
    const id = `dev_test${Date.now()}`;
    const saved = upsertDeviceProfile(id, {
      nickname: 'דני',
      characterColor: '#AABBCC',
      updatedAt: 100,
    });
    expect(saved.nickname).toBe('דני');
    expect(getDeviceProfile(id)?.characterColor).toBe('#AABBCC');
  });

  it('last write with newer updatedAt wins', () => {
    const id = `dev_newer${Date.now()}`;
    upsertDeviceProfile(id, { nickname: 'ישן', updatedAt: 10 });
    const newer = upsertDeviceProfile(id, { nickname: 'חדש', updatedAt: 20 });
    expect(newer.nickname).toBe('חדש');
    // Older write must not overwrite.
    const stale = upsertDeviceProfile(id, { nickname: 'ישן_שוב', updatedAt: 5 });
    expect(stale.nickname).toBe('חדש');
  });
});
