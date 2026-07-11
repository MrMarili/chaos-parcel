import type { HostGameSnapshot } from '../host/hostGameTypes';
import { TOTAL_ROUNDS } from '../host/hostGameTypes';
import { ActivityLog } from './ActivityLog';
import { GameTitle } from './GameTitle';
import { PlayerHud } from './PlayerHud';

interface HostGameRailProps {
  snapshot: HostGameSnapshot;
  holderName?: string;
  connected: boolean;
}

/**
 * Side rail for the TV host — all chrome lives here so the arena stays clean.
 * Stats → roster → live events (no overlays on the play field).
 */
export function HostGameRail({ snapshot, holderName, connected }: HostGameRailProps) {
  return (
    <aside className="host-game-rail" aria-label="מידע משחק">
      <div className="host-game-rail-brand">
        <span className="host-game-rail-icon" aria-hidden="true">
          📦
        </span>
        <div>
          <GameTitle as="p" className="host-game-rail-title" />
          <p className="host-game-rail-sub">זירת המשחק</p>
          {!connected && (
            <p className="error-text host-game-rail-error">החיבור לשרת נותק — רענן את הדף</p>
          )}
        </div>
      </div>

      <div className="host-game-header host-game-header-rail">
        <div className="host-game-stat">
          <span className="host-label">סיבוב</span>
          <strong>
            {snapshot.round}/{TOTAL_ROUNDS}
          </strong>
        </div>
        <div className="host-game-stat">
          <span className="host-label">זמן סיבוב</span>
          <strong
            className={
              snapshot.phase === 'playing' && snapshot.roundRemainingSec <= 10
                ? 'timer-danger'
                : ''
            }
          >
            {Math.ceil(snapshot.roundRemainingSec)}s
          </strong>
        </div>
        <div className="host-game-stat">
          <span className="host-label">חבילה אצל</span>
          <strong>{holderName ?? '—'}</strong>
        </div>
        <div className="host-game-stat">
          <span className="host-label">פתיל</span>
          <strong className={snapshot.packageTimer < 5 ? 'timer-danger' : ''}>
            {snapshot.packageTimer.toFixed(1)}s
          </strong>
        </div>
      </div>

      <div className="host-game-rail-section host-game-rail-players">
        <p className="host-label">שחקנים</p>
        <PlayerHud
          players={snapshot.arenaPlayers}
          scores={snapshot.roundScores}
          holderId={snapshot.packageHolderId}
        />
      </div>

      <div className="host-game-rail-section host-game-rail-events">
        <p className="host-label">אירועים</p>
        <ActivityLog entries={snapshot.activityLog} variant="ticker" maxVisible={30} />
      </div>
    </aside>
  );
}
