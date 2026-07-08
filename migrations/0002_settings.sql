-- Key/value store for runtime configuration (e.g. FRED_API_KEY when it isn't
-- set as a Workers secret).
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
