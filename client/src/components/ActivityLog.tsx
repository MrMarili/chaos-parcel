import { LOG_ICONS, type LogEntry } from '../host/hostGameTypes';

interface ActivityLogProps {
  entries: LogEntry[];
}

export function ActivityLog({ entries }: ActivityLogProps) {
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
              <span className="activity-log-text" dir="rtl">{entry.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
