export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  RESEND_API_KEY?: string;
  FRED_API_KEY?: string;
  ALERT_FROM_EMAIL: string;
  ACCESS_TEAM_DOMAIN?: string;
  ACCESS_AUD?: string;
  ACCESS_DEV_BYPASS?: string;
  ACCESS_DEV_EMAIL?: string;
}

// Hono context: userEmail is the verified email from the Access JWT,
// attached by the requireAccessJwt middleware.
export type AppEnv = {
  Bindings: Env;
  Variables: { userEmail: string };
};

export interface WatchlistItem {
  id: number;
  user_email: string;
  symbol: string;
  label: string | null;
  shares: number | null;
  price_high: number | null;
  price_low: number | null;
  // Comma-separated, ascending, deduped list of percent thresholds (e.g.
  // "1,3,5,10") so multiple move sizes can each fire their own alert.
  percent_change_threshold: string | null;
  created_at: string;
}

export interface WatchlistInput {
  symbol: string;
  label?: string | null;
  shares?: number | null;
  price_high?: number | null;
  price_low?: number | null;
  percent_change_threshold?: string | null;
}

export type AlertType = "price_high" | "price_low" | "percent_change";

export interface AlertLogEntry {
  id: number;
  watchlist_id: number;
  user_email: string;
  symbol: string;
  alert_type: AlertType;
  message: string;
  value: number | null;
  sent_at: string;
}

// Mirrors the alert_state table: tracks whether a configured threshold has
// already fired and is currently holding (active=1) or is armed/waiting to
// fire (active=0 or no row at all).
export interface AlertStateEntry {
  watchlist_id: number;
  alert_type: AlertType;
  threshold_key: string;
  active: number;
  last_value: number | null;
  updated_at: string;
}

// Persistent, fire-once price alert. Independent of the watchlist entry's
// resettable thresholds: once triggered_at is set, the row stays dormant
// and is never re-evaluated.
export interface OneTimeAlert {
  id: number;
  user_email: string;
  symbol: string;
  direction: "above" | "below";
  price: number;
  note: string | null;
  created_at: string;
  triggered_at: string | null;
}

export interface OneTimeAlertInput {
  symbol: string;
  direction: "above" | "below";
  price: number;
  note?: string | null;
}
