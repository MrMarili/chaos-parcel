import { useEffect, useRef } from 'react';
import { LOG_ICONS, type LogEntry } from '../host/hostGameTypes';

interface ActivityLogProps {
  entries: LogEntry[];
  /** panel = card list; ticker = rail feed (oldest→newest, auto-scroll). */
  variant?: 'panel' | 'ticker';
  /** Cap how many recent entries to keep in the ticker feed. */
  maxVisible?: number;
}

export function ActivityLog({
  entries,
  variant = 'panel',
  maxVisible = 24,
}: ActivityLogProps) {
  const listRef = useRef<HTMLUListElement>(null);
  const latestId = entries[0]?.id;

  useEffect(() => {
    if (variant !== 'ticker') return;
    const el = listRef.current;
    if (!el) return;
    // New events append at the bottom — pin the feed to the latest item.
    const pin = () => {
      el.scrollTop = el.scrollHeight;
    };
    pin();
    requestAnimationFrame(pin);
  }, [variant, latestId, entries.length]);

  if (variant === 'ticker') {
    // entries are newest-first; show oldest→newest so the latest sits at the bottom.
    const chronological = [...entries].slice(0, maxVisible).reverse();
    if (chronological.length === 0) {
      return <p className="status-text activity-ticker-empty">עדיין אין אירועים</p>;
    }

    const newestId = entries[0]?.id;

    return (
      <ul ref={listRef} className="activity-ticker" aria-live="polite">
        {chronological.map((entry) => (
          <li
            key={entry.id}
            className={`activity-ticker-item log-${entry.type} ${entry.id === newestId ? 'log-latest' : ''}`}
          >
            <span className="activity-log-icon">{LOG_ICONS[entry.type]}</span>
            <span className="activity-log-text" dir="rtl">
              {entry.text}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="card activity-log-card">
      <div className="activity-log-header">
        <span className="host-label">אירועים אחרונים</span>
      </div>

      {entries.length === 0 ? (
        <p className="status-text">תזוזו עם השלט — הנקודות יזוזו בזירה</p>
      ) : (
        <ul className="activity-log">
          {entries.map((entry, index) => (
            <li
              key={entry.id}
              className={`activity-log-item log-${entry.type} ${index === 0 ? 'log-latest' : ''}`}
            >
              <span className="activity-log-icon">{LOG_ICONS[entry.type]}</span>
              <span className="activity-log-text" dir="rtl">
                {entry.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
