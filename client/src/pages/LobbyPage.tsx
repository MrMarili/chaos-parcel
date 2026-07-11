import type { PlayerInfo } from '@chaos-parcel/shared';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { BrandMark } from '../components/BrandMark';
import { DynamicJoystick } from '../components/DynamicJoystick';
import { useMoveSender } from '../hooks/useMoveSender';
import { AdSlot } from '../components/AdSlot';

interface LobbyPageProps {
  players: PlayerInfo[];
  roomCode: string;
  onMove: (x: number, y: number) => void;
}

export function LobbyPage({ players, roomCode, onMove }: LobbyPageProps) {
  const handleJoystickChange = useMoveSender(onMove);

  return (
    <div className="lobby-layout">
      <div className="lobby-top">
        <BrandMark compact tagline={`חדר ${roomCode}`} />
        <p className="status-text">
          <span className="lobby-waiting-pulse">ממתינים להתחלה מהמסך הראשי...</span>
        </p>

        <div className="card lobby-players-card">
          <p className="section-label">שחקנים בחדר ({players.length})</p>
          <ul className="player-list">
            {players.map((player) => (
              <li key={player.player_id} className="player-item">
                <PlayerAvatar
                  nickname={player.nickname}
                  color={player.character_color}
                  avatar={player.avatar}
                  cosmetics={player.cosmetics}
                  size={36}
                />
                <span>{player.nickname}</span>
              </li>
            ))}
          </ul>
        </div>

        <AdSlot slot="phone_lobby" variant="compact" />

        <p className="lobby-test-hint">
          גע למטה והזז — הדמות שלך אמורה לזוז במסך הראשי
        </p>
      </div>

      <DynamicJoystick className="lobby-joystick" onChange={handleJoystickChange} />
    </div>
  );
}
