import { freeCosmeticIds } from '@chaos-parcel/shared';
import {
  loadEquippedCosmetics,
  loadOwnedCosmetics,
  saveEquippedCosmetics,
  saveOwnedCosmetics,
} from './monetization/storage';

const DEVICE_ID_KEY = 'chaos-parcel:device-id';
const DEVICE_PROFILE_KEY = 'chaos-parcel:device-profile';

export interface DeviceProfile {
  deviceId: string;
  nickname: string;
  characterColor?: string;
  avatar?: string;
  cosmetics?: string[];
  /** Unix ms — last successful join on this device. */
  updatedAt: number;
}

function createDeviceId(): string {
  // HTTP on a LAN IP is not a secure context — crypto.randomUUID() may be missing.
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `dev_${crypto.randomUUID().replace(/-/g, '')}`;
    }
  } catch {
    // insecure context / restricted crypto
  }

  try {
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return `dev_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
    }
  } catch {
    // fall through
  }

  return `dev_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export function getOrCreateDeviceId(): string {
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY);
    if (existing && /^dev_[a-zA-Z0-9]+$/.test(existing)) {
      return existing;
    }
  } catch {
    // fall through
  }

  const id = createDeviceId();
  try {
    localStorage.setItem(DEVICE_ID_KEY, id);
  } catch {
    // Private mode — still return ephemeral id for this session.
  }
  return id;
}

export function loadLocalDeviceProfile(): DeviceProfile | null {
  const deviceId = getOrCreateDeviceId();
  try {
    const raw = localStorage.getItem(DEVICE_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeviceProfile;
    if (!parsed?.nickname || typeof parsed.nickname !== 'string') return null;
    return {
      deviceId,
      nickname: parsed.nickname.trim().slice(0, 50),
      ...(parsed.characterColor ? { characterColor: parsed.characterColor } : {}),
      ...(parsed.avatar ? { avatar: parsed.avatar } : {}),
      cosmetics: parsed.cosmetics?.length
        ? parsed.cosmetics
        : loadEquippedCosmetics(),
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

export function saveLocalDeviceProfile(
  profile: Omit<DeviceProfile, 'deviceId' | 'updatedAt'> & { updatedAt?: number },
): DeviceProfile {
  const deviceId = getOrCreateDeviceId();
  const next: DeviceProfile = {
    deviceId,
    nickname: profile.nickname.trim().slice(0, 50),
    ...(profile.characterColor ? { characterColor: profile.characterColor } : {}),
    ...(profile.avatar ? { avatar: profile.avatar } : {}),
    cosmetics: profile.cosmetics?.length
      ? profile.cosmetics
      : loadEquippedCosmetics(),
    updatedAt: profile.updatedAt ?? Date.now(),
  };

  try {
    localStorage.setItem(DEVICE_PROFILE_KEY, JSON.stringify(next));
  } catch {
    // Quota — often the avatar; retry without avatar.
    try {
      const { avatar: _drop, ...withoutAvatar } = next;
      localStorage.setItem(DEVICE_PROFILE_KEY, JSON.stringify(withoutAvatar));
    } catch {
      // ignore
    }
  }

  if (next.cosmetics?.length) {
    saveEquippedCosmetics(next.cosmetics);
    const owned = loadOwnedCosmetics();
    saveOwnedCosmetics([...new Set([...owned, ...next.cosmetics, ...freeCosmeticIds()])]);
  }

  return next;
}

/** Merge local + server; newer updatedAt wins field-by-field with full-record preference. */
export function mergeDeviceProfiles(
  local: DeviceProfile | null,
  remote: DeviceProfile | null,
): DeviceProfile | null {
  if (!local) return remote;
  if (!remote) return local;
  return remote.updatedAt > local.updatedAt ? { ...remote, deviceId: local.deviceId } : local;
}

export async function fetchRemoteDeviceProfile(
  deviceId: string,
): Promise<DeviceProfile | null> {
  try {
    const res = await fetch(`/api/device-profiles/${encodeURIComponent(deviceId)}`);
    if (res.status === 404) return null;
    if (!res.ok) return null;
    const data = (await res.json()) as DeviceProfile;
    if (!data?.nickname) return null;
    return {
      deviceId,
      nickname: data.nickname,
      ...(data.characterColor ? { characterColor: data.characterColor } : {}),
      ...(data.avatar ? { avatar: data.avatar } : {}),
      ...(data.cosmetics?.length ? { cosmetics: data.cosmetics } : {}),
      updatedAt: data.updatedAt ?? 0,
    };
  } catch {
    return null;
  }
}

export async function syncDeviceProfileToServer(profile: DeviceProfile): Promise<void> {
  try {
    await fetch(`/api/device-profiles/${encodeURIComponent(profile.deviceId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nickname: profile.nickname,
        characterColor: profile.characterColor,
        avatar: profile.avatar,
        cosmetics: profile.cosmetics,
        updatedAt: profile.updatedAt,
      }),
    });
  } catch {
    // Offline / LAN blip — local profile still saved.
  }
}
