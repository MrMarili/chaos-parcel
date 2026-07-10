interface PlayerAvatarProps {
  nickname: string;
  color: string;
  avatar?: string;
  size?: number;
}

export function PlayerAvatar({ nickname, color, avatar, size = 32 }: PlayerAvatarProps) {
  return (
    <span
      className="player-avatar"
      style={{
        width: size,
        height: size,
        borderColor: color,
        background: avatar ? '#000' : color,
      }}
    >
      {avatar ? (
        <img src={avatar} alt={nickname} />
      ) : (
        <span className="player-avatar-initial">{nickname.charAt(0)}</span>
      )}
    </span>
  );
}
