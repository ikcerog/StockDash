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
  percent_change_threshold: number | null;
  created_at: string;
}

export interface WatchlistInput {
  symbol: string;
  label?: string | null;
  shares?: number | null;
  price_high?: number | null;
  price_low?: number | null;
  percent_change_threshold?: number | null;
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
