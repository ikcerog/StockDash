-- Support multiple percent-change alert thresholds per watchlist entry
-- (comma-separated list, e.g. "1,3,5,10"), so alerts can fire separately at
-- each move size instead of just one. percent_change_threshold moves from a
-- single REAL to a normalized TEXT list. alert_state gains threshold_key so
-- each threshold in the list gets its own active/inactive tracking; price
-- and price_low/high alerts keep threshold_key = '' since they're still
-- single-valued.

ALTER TABLE watchlist RENAME COLUMN percent_change_threshold TO percent_change_threshold_old;
ALTER TABLE watchlist ADD COLUMN percent_change_threshold TEXT;
UPDATE watchlist
  SET percent_change_threshold = printf('%g', percent_change_threshold_old)
  WHERE percent_change_threshold_old IS NOT NULL;
ALTER TABLE watchlist DROP COLUMN percent_change_threshold_old;

CREATE TABLE alert_state_new (
  watchlist_id INTEGER NOT NULL REFERENCES watchlist(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('price_high', 'price_low', 'percent_change')),
  threshold_key TEXT NOT NULL DEFAULT '',
  active INTEGER NOT NULL DEFAULT 0,
  last_value REAL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (watchlist_id, alert_type, threshold_key)
);
INSERT INTO alert_state_new (watchlist_id, alert_type, threshold_key, active, last_value, updated_at)
SELECT
  s.watchlist_id,
  s.alert_type,
  CASE WHEN s.alert_type = 'percent_change' THEN COALESCE(w.percent_change_threshold, '') ELSE '' END,
  s.active,
  s.last_value,
  s.updated_at
FROM alert_state s
JOIN watchlist w ON w.id = s.watchlist_id;

DROP TABLE alert_state;
ALTER TABLE alert_state_new RENAME TO alert_state;
