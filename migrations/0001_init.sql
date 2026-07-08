-- Stocks/ETFs being tracked, with optional per-symbol alert thresholds.
CREATE TABLE watchlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL UNIQUE,
  label TEXT,
  shares REAL,
  price_high REAL,
  price_low REAL,
  percent_change_threshold REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Tracks whether an alert condition is currently "active" so we only email
-- on the transition into the condition, not on every cron tick it holds.
CREATE TABLE alert_state (
  watchlist_id INTEGER NOT NULL REFERENCES watchlist(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('price_high', 'price_low', 'percent_change')),
  active INTEGER NOT NULL DEFAULT 0,
  last_value REAL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (watchlist_id, alert_type)
);

CREATE TABLE alert_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  watchlist_id INTEGER NOT NULL REFERENCES watchlist(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  message TEXT NOT NULL,
  value REAL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_alert_log_sent_at ON alert_log(sent_at DESC);
