import { useEffect, useRef, useState } from 'react';
import { fileToAvatarDataUrl } from '../utils/image';
import { BrandMark } from '../components/BrandMark';
import { GameHowTo } from '../components/GameHowTo';
import { warmHaptics } from '../utils/haptics';
import { AdSlot } from '../components/AdSlot';
import { PlayerAvatar } from '../components/PlayerAvatar';
import {
  loadEquippedCosmetics,
  saveEquippedCosmetics,
} from '../monetization/storage';
import {
  type DeviceProfile,
  fetchRemoteDeviceProfile,
  getOrCreateDeviceId,
  loadLocalDeviceProfile,
  mergeDeviceProfiles,
} from '../deviceProfile';

export interface JoinPayload {
  nickname: string;
  avatar?: string;
  cosmetics?: string[];
  characterColor?: string;
  deviceId: string;
}

interface JoinPageProps {
  roomCode: string;
  connected: boolean;
  error: string | null;
  onJoin: (payload: JoinPayload) => void;
}

export function JoinPage({
  roomCode,
  connected,
  error,
  onJoin,
}: JoinPageProps) {
  const deviceId = useRef(getOrCreateDeviceId()).current;
  const [profileReady, setProfileReady] = useState(false);
  const [returning, setReturning] = useState<DeviceProfile | null>(null);
  const [editing, setEditing] = useState(false);

  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [preferredColor, setPreferredColor] = useState<string | undefined>();
  const [cosmetics, setCosmetics] = useState(() => loadEquippedCosmetics());
  const [imageError, setImageError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const local = loadLocalDeviceProfile();
      const remote = await fetchRemoteDeviceProfile(deviceId);
      if (cancelled) return;
      const merged = mergeDeviceProfiles(local, remote);
      if (merged?.nickname) {
        setReturning(merged);
        setNickname(merged.nickname);
        setAvatar(merged.avatar ?? null);
        setPreferredColor(merged.characterColor);
        if (merged.cosmetics?.length) {
          setCosmetics(merged.cosmetics);
          saveEquippedCosmetics(merged.cosmetics);
        }
        setEditing(false);
      } else {
        setEditing(true);
      }
      setProfileReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [deviceId]);

  const canJoin = nickname.trim().length > 0 && connected && !processing;

  const submit = (payload: {
    nickname: string;
    avatar?: string | null;
    cosmetics?: string[];
    characterColor?: string;
  }) => {
    warmHaptics();
    onJoin({
      nickname: payload.nickname.trim(),
      deviceId,
      ...(payload.avatar ? { avatar: payload.avatar } : {}),
      ...(payload.cosmetics?.length ? { cosmetics: payload.cosmetics } : {}),
      ...(payload.characterColor ? { characterColor: payload.characterColor } : {}),
    });
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setImageError(null);
    setProcessing(true);
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      setAvatar(dataUrl);
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'שגיאה בעיבוד התמונה');
    } finally {
      setProcessing(false);
    }
  };

  if (!profileReady) {
    return (
      <div className="page page-join">
        <BrandMark tagline={`קוד חדר: ${roomCode}`} />
        <p className="status-text">טוען פרטים שמורים...</p>
      </div>
    );
  }

  if (returning && !editing) {
    return (
      <div className="page page-join">
        <BrandMark tagline={`קוד חדר: ${roomCode}`} />

        <div className="card returning-player-card">
          <p className="section-label">ברוך שובך</p>
          <div className="returning-player-row">
            <PlayerAvatar
              nickname={returning.nickname}
              color={returning.characterColor ?? '#FF8C66'}
              avatar={returning.avatar}
              cosmetics={returning.cosmetics}
              size={64}
            />
            <div>
              <p className="returning-player-name">{returning.nickname}</p>
              <p className="status-text">
                להיכנס עם הפרטים מהפעם הקודמת?
              </p>
            </div>
          </div>

          {error && <p className="error-text">{error}</p>}
          {!connected && <p className="status-text">מתחבר לשרת...</p>}

          <button
            type="button"
            className="btn-primary join-submit-btn"
            disabled={!connected}
            onClick={() =>
              submit({
                nickname: returning.nickname,
                avatar: returning.avatar,
                cosmetics: returning.cosmetics ?? cosmetics,
                characterColor: returning.characterColor,
              })
            }
          >
            המשך עם הפרטים האלה
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setEditing(true)}
          >
            שנה פרטים
          </button>
        </div>

        <AdSlot slot="phone_join" variant="banner" className="join-ad" />
        <GameHowTo className="join-howto-below-cta" />
      </div>
    );
  }

  return (
    <div className="page page-join">
      <BrandMark tagline={`קוד חדר: ${roomCode}`} />

      {returning && (
        <p className="status-text returning-edit-hint">
          עורכים את הפרטים השמורים — הכניסה תעדכן אותם לפעם הבאה
        </p>
      )}

      <div className="card avatar-card">
        <div
          className={`avatar-preview ${avatar ? 'has-photo' : ''}`}
          style={
            !avatar && preferredColor
              ? { background: preferredColor, borderColor: preferredColor }
              : undefined
          }
        >
          {avatar ? (
            <img src={avatar} alt="תמונת שחקן" />
          ) : (
            <span className="avatar-placeholder">📷</span>
          )}
        </div>

        <p className="status-text avatar-hint">
          תמונה אופציונלית — בלי תמונה תקבל צבע ייחודי בזירה
        </p>

        <div className="avatar-buttons">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => cameraInputRef.current?.click()}
            disabled={processing}
          >
            צלם תמונה
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => galleryInputRef.current?.click()}
            disabled={processing}
          >
            מהגלריה
          </button>
          {avatar && (
            <button
              type="button"
              className="btn-secondary btn-remove"
              onClick={() => setAvatar(null)}
              disabled={processing}
            >
              הסר
            </button>
          )}
        </div>

        {processing && <p className="status-text">מעבד תמונה...</p>}
        {imageError && <p className="error-text">{imageError}</p>}

        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="user"
          hidden
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>

      <div className="card">
        <p className="section-label">כינוי</p>
        <input
          className="nickname-input"
          placeholder="הכנס כינוי..."
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={50}
        />
      </div>

      {error && <p className="error-text">{error}</p>}
      {!connected && <p className="status-text">מתחבר לשרת...</p>}

      <button
        type="button"
        className="btn-primary join-submit-btn"
        disabled={!canJoin}
        onClick={() =>
          submit({
            nickname,
            avatar,
            cosmetics,
            characterColor: preferredColor,
          })
        }
      >
        הצטרף למשחק
      </button>

      <AdSlot slot="phone_join" variant="banner" className="join-ad" />

      {/* Must stay after the join CTA — phones often load server dist, not Vite HMR */}
      <GameHowTo className="join-howto-below-cta" />
    </div>
  );
}
