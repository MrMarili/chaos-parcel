import type { PlayerInfo } from '@chaos-parcel/shared';
import { PlayerAvatar } from '../components/PlayerAvatar';
import { BrandMark } from '../components/BrandMark';

interface LobbyPageProps {
  players: PlayerInfo[];
  roomCode: string;
}

export function LobbyPage({ players, roomCode }: LobbyPageProps) {
  return (
    <div className="page">
      <BrandMark compact tagline={`חדר ${roomCode}`} />
      <p className="status-text">
        <span className="lobby-waiting-pulse">ממתינים להתחלה מהטלוויזיה...</span>
      </p>

      <div className="card">
        <p className="section-label">שחקנים בחדר ({players.length})</p>
        <ul className="player-list">
          {players.map((player) => (
            <li key={player.player_id} className="player-item">
              <PlayerAvatar
                nickname={player.nickname}
                color={player.character_color}
                avatar={player.avatar}
                size={40}
              />
              <span>{player.nickname}</span>
            </li>
          ))}
        </ul>
        {players.length === 0 && (
          <p className="status-text">אין שחקנים עדיין...</p>
        )}
      </div>

      <p className="status-text">
        הדמות שלך תופיע על המסך הגדול. בדוק שהשלט מגיב!
      </p>
    </div>
  );
}
