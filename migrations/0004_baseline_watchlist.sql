-- Default symbols every user starts with. A user's watchlist is copied from
-- this table on their first visit (tracked in user_seeded so deleting a
-- baseline stock doesn't resurrect it on the next load).
CREATE TABLE baseline_watchlist (
  symbol TEXT PRIMARY KEY,
  label TEXT
);

INSERT INTO baseline_watchlist (symbol, label) VALUES
  ('RKT', 'Rocket Companies'),
  ('UWMC', 'UWM Holdings (United Wholesale Mortgage)'),
  ('BAC', 'Bank of America'),
  ('WFC', 'Wells Fargo'),
  ('FNMA', 'Fannie Mae'),
  ('FMCC', 'Freddie Mac'),
  ('TWO', 'Two Harbors Investment (mortgage REIT)'),
  ('Z', 'Zillow'),
  ('COMP', 'Compass'),
  ('LDI', 'Loan Depot'),
  ('BETR', 'Better Mortgage'),
  ('PFSI', 'PennyMac'),
  ('RITM', 'Rithm Capital (New Rez)');

CREATE TABLE user_seeded (
  user_email TEXT PRIMARY KEY,
  seeded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
