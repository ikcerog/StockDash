-- One-time (persistent) price alerts. Unlike the price_high/price_low/
-- percent_change thresholds on the watchlist row — which fire on each
-- transition into a met state and re-arm when the condition clears
-- (typically at the next trading day) — a one_time_alert fires exactly once
-- and stays dormant afterwards: triggered_at is set on fire and the row is
-- never re-armed. Symbol is stored on the row rather than joined to
-- watchlist so users can set an alert on a ticker they don't otherwise
-- track, and so the alert survives the watchlist entry being deleted.

CREATE TABLE one_time_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_email TEXT NOT NULL,
  symbol TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('above', 'below')),
  price REAL NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  triggered_at TEXT
);

CREATE INDEX idx_one_time_alerts_user_email ON one_time_alerts(user_email);
CREATE INDEX idx_one_time_alerts_pending ON one_time_alerts(triggered_at) WHERE triggered_at IS NULL;
