import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Router } from 'express';
import { z } from 'zod';
import { MAX_AVATAR_LENGTH } from '@chaos-parcel/shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STORE_PATH = path.resolve(__dirname, '../data/device-profiles.json');
const MAX_PROFILES = 2_000;

const deviceIdSchema = z
  .string()
  .min(8)
  .max(64)
  .regex(/^dev_[a-zA-Z0-9]+$/);

const profileBodySchema = z.object({
  nickname: z.string().min(1).max(50).trim(),
  characterColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
  avatar: z
    .string()
    .max(MAX_AVATAR_LENGTH)
    .regex(/^data:image\/(png|jpeg|webp);base64,/)
    .optional(),
  cosmetics: z.array(z.string().min(1).max(64)).max(8).optional(),
  updatedAt: z.number().int().positive().optional(),
});

export interface StoredDeviceProfile {
  deviceId: string;
  nickname: string;
  characterColor?: string;
  avatar?: string;
  cosmetics?: string[];
  updatedAt: number;
}

const profiles = new Map<string, StoredDeviceProfile>();

function loadFromDisk(): void {
  try {
    if (!fs.existsSync(STORE_PATH)) return;
    const raw = fs.readFileSync(STORE_PATH, 'utf8');
    const parsed = JSON.parse(raw) as StoredDeviceProfile[];
    if (!Array.isArray(parsed)) return;
    for (const row of parsed) {
      if (!row?.deviceId || !row?.nickname) continue;
      profiles.set(row.deviceId, row);
    }
  } catch (err) {
    console.warn('[device-profiles] failed to load store', err);
  }
}

function persistToDisk(): void {
  try {
    const dir = path.dirname(STORE_PATH);
    fs.mkdirSync(dir, { recursive: true });
    // Evict oldest if over cap.
    if (profiles.size > MAX_PROFILES) {
      const sorted = [...profiles.values()].sort((a, b) => a.updatedAt - b.updatedAt);
      const drop = sorted.slice(0, profiles.size - MAX_PROFILES);
      for (const row of drop) profiles.delete(row.deviceId);
    }
    fs.writeFileSync(STORE_PATH, JSON.stringify([...profiles.values()], null, 0), 'utf8');
  } catch (err) {
    console.warn('[device-profiles] failed to persist store', err);
  }
}

loadFromDisk();

export function upsertDeviceProfile(
  deviceId: string,
  patch: Omit<StoredDeviceProfile, 'deviceId'>,
): StoredDeviceProfile {
  const existing = profiles.get(deviceId);
  const updatedAt = patch.updatedAt ?? Date.now();
  // Last join always wins when equal-or-newer.
  if (existing && existing.updatedAt > updatedAt) {
    return existing;
  }
  const next: StoredDeviceProfile = {
    deviceId,
    nickname: patch.nickname,
    updatedAt,
    ...(patch.characterColor ? { characterColor: patch.characterColor } : {}),
    ...(patch.avatar ? { avatar: patch.avatar } : {}),
    ...(patch.cosmetics?.length ? { cosmetics: patch.cosmetics } : {}),
  };
  profiles.set(deviceId, next);
  persistToDisk();
  return next;
}

export function getDeviceProfile(deviceId: string): StoredDeviceProfile | undefined {
  return profiles.get(deviceId);
}

export function createDeviceProfileRouter(): Router {
  const router = Router();

  router.get('/:deviceId', (req, res) => {
    const parsedId = deviceIdSchema.safeParse(req.params.deviceId);
    if (!parsedId.success) {
      res.status(400).json({ error: 'INVALID_DEVICE_ID' });
      return;
    }
    const profile = getDeviceProfile(parsedId.data);
    if (!profile) {
      res.status(404).json({ error: 'NOT_FOUND' });
      return;
    }
    res.json(profile);
  });

  router.put('/:deviceId', (req, res) => {
    const parsedId = deviceIdSchema.safeParse(req.params.deviceId);
    if (!parsedId.success) {
      res.status(400).json({ error: 'INVALID_DEVICE_ID' });
      return;
    }
    const body = profileBodySchema.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: 'INVALID_BODY', details: body.error.flatten() });
      return;
    }
    const saved = upsertDeviceProfile(parsedId.data, {
      nickname: body.data.nickname,
      updatedAt: body.data.updatedAt ?? Date.now(),
      ...(body.data.characterColor
        ? { characterColor: body.data.characterColor.toUpperCase() }
        : {}),
      ...(body.data.avatar ? { avatar: body.data.avatar } : {}),
      ...(body.data.cosmetics?.length ? { cosmetics: body.data.cosmetics } : {}),
    });
    res.json(saved);
  });

  return router;
}
