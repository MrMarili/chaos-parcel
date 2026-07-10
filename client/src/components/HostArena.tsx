import type { CSSProperties } from 'react';
import type { HostGameSnapshot } from '../host/hostGameTypes';
import { EXPLOSION_DISPLAY_MS, PACKAGE_TIMER_MAX } from '../host/hostGameTypes';
import { PlayerHud } from './PlayerHud';

/** CSS custom properties used to drive fuse pulse speed/glow via inline style. */
interface FuseStyle extends CSSProperties {
  '--fuse-speed'?: string;
  '--fuse-glow'?: string;
}

interface HostArenaProps {
  snapshot: HostGameSnapshot;
}

export function HostArena({ snapshot }: HostArenaProps) {
  const holder = snapshot.packageHolderId;
  const explosion = snapshot.lastExplosion;
  const showExplosion =
    explosion && Date.now() - explosion.startedAt < EXPLOSION_DISPLAY_MS;

  // Fuse fraction: 1 = fresh package, 0 = about to explode. Drives pulse speed + glow.
  const fuseRemaining = Math.min(1, Math.max(0, snapshot.packageTimer / PACKAGE_TIMER_MAX));
  const fuseSpeed = `${0.25 + fuseRemaining * 0.75}s`;
  const fuseGlow = `rgba(255, ${Math.round(90 - (1 - fuseRemaining) * 60)}, ${Math.round(54 - (1 - fuseRemaining) * 54)}, ${0.6 + (1 - fuseRemaining) * 0.4})`;

  return (
    <div className="host-arena">
      <div className="host-arena-main">
        <div className="host-arena-lava-ring" />
        <div className="host-arena-floor">
          <div className="host-arena-parcel">📦</div>
          {snapshot.arenaPlayers.map((player) => {
            const isHolder = holder === player.playerId;
            const isExploding = showExplosion && explosion.playerId === player.playerId;
            return (
              <div
                key={player.playerId}
                className={`host-arena-player ${isHolder ? 'has-package' : ''} ${isExploding ? 'is-exploding' : ''}`}
                style={{
                  left: `${player.x * 100}%`,
                  top: `${player.y * 100}%`,
                  borderColor: player.color,
                  background: player.avatar ? '#000' : player.color,
                  ...(isHolder
                    ? ({ '--fuse-speed': fuseSpeed, '--fuse-glow': fuseGlow } as FuseStyle)
                    : {}),
                }}
                title={player.nickname}
              >
                {isHolder && !isExploding && (
                  <div className="arena-fuse">
                    <span className="arena-fuse-flame" style={{ '--fuse-speed': fuseSpeed } as FuseStyle}>
                      🔥
                    </span>
                  </div>
                )}
                {isExploding && (
                  <div className="arena-explosion-fx">
                    <div className="arena-explosion-ring" />
                    <span className="arena-explosion-emoji">💥</span>
                    <span className="arena-explosion-label">בום!</span>
                  </div>
                )}
                {player.avatar && (
                  <img className="host-arena-avatar" src={player.avatar} alt={player.nickname} />
                )}
                <span className="host-arena-name">{player.nickname}</span>
                {isHolder && <span className="host-arena-badge">📦</span>}
              </div>
            );
          })}
        </div>
      </div>
      <PlayerHud
        players={snapshot.arenaPlayers}
        scores={snapshot.roundScores}
        holderId={holder}
      />
    </div>
  );
}
