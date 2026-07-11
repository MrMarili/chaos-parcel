interface PlayerAvatarProps {
  nickname: string;
  color: string;
  avatar?: string;
  size?: number;
  /** Equipped cosmetic ids (e.g. frame_gold). */
  cosmetics?: string[];
}

function frameAccent(cosmetics?: string[]): string | undefined {
  if (!cosmetics?.length) return undefined;
  if (cosmetics.includes('frame_gold')) return '#E8B84A';
  if (cosmetics.includes('frame_neon')) return '#3DDC97';
  return undefined;
}

/** Color/photo disc only — nickname is shown next to the avatar, not inside it. */
export function PlayerAvatar({
  nickname,
  color,
  avatar,
  size = 32,
  cosmetics,
}: PlayerAvatarProps) {
  const frame = frameAccent(cosmetics);
  return (
    <span
      className={`player-avatar${frame ? ' player-avatar--framed' : ''}`}
      style={{
        width: size,
        height: size,
        borderColor: frame ?? color,
        boxShadow: frame ? `0 0 0 2px ${frame}` : undefined,
        background: avatar ? '#000' : color,
      }}
      aria-label={nickname}
      title={nickname}
    >
      {avatar ? <img src={avatar} alt="" /> : null}
    </span>
  );
}
