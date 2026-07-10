import { useRef, useState } from 'react';
import { CHARACTER_COLORS } from '../config';
import { fileToAvatarDataUrl } from '../utils/image';
import { BrandMark } from '../components/BrandMark';

interface JoinPageProps {
  roomCode: string;
  connected: boolean;
  error: string | null;
  onJoin: (nickname: string, color: string, avatar?: string) => void;
}

export function JoinPage({ roomCode, connected, error, onJoin }: JoinPageProps) {
  const [nickname, setNickname] = useState('');
  const [color, setColor] = useState<string>(CHARACTER_COLORS[0]);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const canJoin = nickname.trim().length > 0 && connected && !processing;

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

  return (
    <div className="page">
      <BrandMark tagline={`קוד חדר: ${roomCode}`} />

      <div className="card avatar-card">
        <div
          className="avatar-preview"
          style={{ borderColor: color, background: avatar ? undefined : color }}
        >
          {avatar ? (
            <img src={avatar} alt="תמונת שחקן" />
          ) : (
            <span className="avatar-placeholder">📷</span>
          )}
        </div>

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

      <div className="card">
        <p className="section-label">בחר צבע מסגרת</p>
        <div className="color-grid">
          {CHARACTER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`color-swatch ${color === c ? 'selected' : ''}`}
              style={{ background: c }}
              onClick={() => setColor(c)}
              aria-label={`צבע ${c}`}
            />
          ))}
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}
      {!connected && <p className="status-text">מתחבר לשרת...</p>}

      <button
        type="button"
        className="btn-primary"
        disabled={!canJoin}
        onClick={() => onJoin(nickname.trim(), color, avatar ?? undefined)}
      >
        הצטרף למשחק
      </button>
    </div>
  );
}
