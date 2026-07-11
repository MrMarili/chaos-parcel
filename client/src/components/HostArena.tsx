import type { CSSProperties } from 'react';
import type { HostGameSnapshot } from '../host/hostGameTypes';
import { EXPLOSION_DISPLAY_MS, PACKAGE_TIMER_MAX } from '../host/hostGameTypes';
import { obstacleSvgPath } from '../host/arenaObstacles';
import { bindPlayerElement } from '../host/movementRuntime';

interface FuseStyle extends CSSProperties {
  '--fuse-speed'?: string;
  '--fuse-glow'?: string;
}

interface HostArenaProps {
  snapshot: HostGameSnapshot;
}

/** Tokens move in the arena; names sit beside them (HUD scores stay in the side rail). */
export function HostArena({ snapshot }: HostArenaProps) {
  const holder = snapshot.packageHolderId;
  const explosion = snapshot.lastExplosion;
  const showExplosion =
    explosion && Date.now() - explosion.startedAt < EXPLOSION_DISPLAY_MS;

  const fuseRemaining = Math.min(1, Math.max(0, snapshot.packageTimer / PACKAGE_TIMER_MAX));
  const fuseSpeed = `${0.25 + fuseRemaining * 0.75}s`;
  const fuseGlow = `rgba(255, ${Math.round(90 - (1 - fuseRemaining) * 60)}, ${Math.round(54 - (1 - fuseRemaining) * 54)}, ${0.6 + (1 - fuseRemaining) * 0.4})`;

  return (
    <div className="host-arena">
      <div className="host-arena-main">
        <div className="host-arena-lava-ring" />
        <div className="host-arena-floor">
          {snapshot.obstacles.length > 0 && (
            <svg
              className="host-arena-obstacles"
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {snapshot.obstacles.map((obstacle) => (
                <path
                  key={obstacle.id}
                  d={obstacleSvgPath(obstacle)}
                  fill="none"
                  stroke={obstacle.color}
                  strokeWidth={obstacle.thickness}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </svg>
          )}
          {snapshot.arenaPlayers.map((player) => {
            const isHolder = holder === player.playerId;
            const isExploding = showExplosion && explosion.playerId === player.playerId;
            return (
              <div
                key={player.playerId}
                ref={(el) => bindPlayerElement(player.playerId, el)}
                className={`host-arena-player ${isHolder ? 'has-package' : ''} ${isExploding ? 'is-exploding' : ''}`}
                style={{
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
                  <img className="host-arena-avatar" src={player.avatar} alt="" />
                )}
                <span className="host-arena-name">{player.nickname}</span>
                {isHolder && <span className="host-arena-badge">📦</span>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
