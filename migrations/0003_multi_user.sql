-- Scope watchlists per user. Identity is the verified email claim from the
-- Cloudflare Access JWT; existing rows are backfilled to the original
-- single-user owner.
--
-- The alert tables are rebuilt alongside watchlist so their rows survive:
-- dropping the old watchlist while they still reference it would
-- cascade-delete them. The new child tables reference watchlist_new, and
-- SQLite rewrites those references when the table is renamed back.

CREATE TABLE watchlist_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_email TEXT NOT NULL,
  symbol TEXT NOT NULL,
  label TEXT,
  shares REAL,
  price_high REAL,
  price_low REAL,
  percent_change_threshold REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_email, symbol)
);
INSERT INTO watchlist_new (id, user_email, symbol, label, shares, price_high, price_low, percent_change_threshold, created_at)
SELECT id, 'johnagorecki@gmail.com', symbol, label, shares, price_high, price_low, percent_change_threshold, created_at
FROM watchlist;

CREATE TABLE alert_state_new (
  watchlist_id INTEGER NOT NULL REFERENCES watchlist_new(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('price_high', 'price_low', 'percent_change')),
  active INTEGER NOT NULL DEFAULT 0,
  last_value REAL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (watchlist_id, alert_type)
);
INSERT INTO alert_state_new SELECT * FROM alert_state;

-- alert_log gains user_email so history stays queryable per user without a
-- join, even though rows are cascade-deleted with their watchlist entry.
CREATE TABLE alert_log_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  watchlist_id INTEGER NOT NULL REFERENCES watchlist_new(id) ON DELETE CASCADE,
  user_email TEXT NOT NULL,
  symbol TEXT NOT NULL,
  alert_type TEXT NOT NULL,
  message TEXT NOT NULL,
  value REAL,
  sent_at TEXT NOT NULL DEFAULT (datetime('now'))
);
INSERT INTO alert_log_new (id, watchlist_id, user_email, symbol, alert_type, message, value, sent_at)
SELECT id, watchlist_id, 'johnagorecki@gmail.com', symbol, alert_type, message, value, sent_at
FROM alert_log;

DROP TABLE alert_log;
DROP TABLE alert_state;
DROP TABLE watchlist;

ALTER TABLE watchlist_new RENAME TO watchlist;
ALTER TABLE alert_state_new RENAME TO alert_state;
ALTER TABLE alert_log_new RENAME TO alert_log;

CREATE INDEX idx_watchlist_user_email ON watchlist(user_email);
CREATE INDEX idx_alert_log_sent_at ON alert_log(sent_at DESC);
