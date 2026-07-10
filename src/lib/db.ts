import type { AlertLogEntry, AlertStateEntry, AlertType, WatchlistInput, WatchlistItem } from "../types";

// Copy the baseline symbols into a user's watchlist on their first visit.
// user_seeded records who has been seeded, so users who later delete a
// baseline stock don't get it re-added.
export async function ensureBaselineSeeded(db: D1Database, userEmail: string): Promise<void> {
  const seeded = await db
    .prepare("SELECT 1 AS one FROM user_seeded WHERE user_email = ?")
    .bind(userEmail)
    .first();
  if (seeded) return;

  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO watchlist (user_email, symbol, label)
         SELECT ?, symbol, label FROM baseline_watchlist`,
      )
      .bind(userEmail),
    db.prepare("INSERT OR IGNORE INTO user_seeded (user_email) VALUES (?)").bind(userEmail),
  ]);
}

export async function listWatchlist(db: D1Database, userEmail: string): Promise<WatchlistItem[]> {
  const { results } = await db
    .prepare("SELECT * FROM watchlist WHERE user_email = ? ORDER BY symbol ASC")
    .bind(userEmail)
    .all<WatchlistItem>();
  return results;
}

// All users' items, for the scheduled alert check.
export async function listAllWatchlist(db: D1Database): Promise<WatchlistItem[]> {
  const { results } = await db
    .prepare("SELECT * FROM watchlist ORDER BY user_email ASC, symbol ASC")
    .all<WatchlistItem>();
  return results;
}

export async function getWatchlistItem(db: D1Database, id: number, userEmail: string): Promise<WatchlistItem | null> {
  return db
    .prepare("SELECT * FROM watchlist WHERE id = ? AND user_email = ?")
    .bind(id, userEmail)
    .first<WatchlistItem>();
}

export async function createWatchlistItem(
  db: D1Database,
  userEmail: string,
  input: WatchlistInput,
): Promise<WatchlistItem> {
  const result = await db
    .prepare(
      `INSERT INTO watchlist (user_email, symbol, label, shares, price_high, price_low, percent_change_threshold)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       RETURNING *`,
    )
    .bind(
      userEmail,
      input.symbol.toUpperCase(),
      input.label ?? null,
      input.shares ?? null,
      input.price_high ?? null,
      input.price_low ?? null,
      input.percent_change_threshold ?? null,
    )
    .first<WatchlistItem>();
  if (!result) throw new Error("Failed to create watchlist item");
  return result;
}

export async function updateWatchlistItem(
  db: D1Database,
  id: number,
  userEmail: string,
  input: Partial<WatchlistInput>,
): Promise<WatchlistItem | null> {
  const existing = await getWatchlistItem(db, id, userEmail);
  if (!existing) return null;

  const merged = { ...existing, ...input };
  return db
    .prepare(
      `UPDATE watchlist
       SET label = ?, shares = ?, price_high = ?, price_low = ?, percent_change_threshold = ?
       WHERE id = ? AND user_email = ?
       RETURNING *`,
    )
    .bind(
      merged.label ?? null,
      merged.shares ?? null,
      merged.price_high ?? null,
      merged.price_low ?? null,
      merged.percent_change_threshold ?? null,
      id,
      userEmail,
    )
    .first<WatchlistItem>();
}

export async function deleteWatchlistItem(db: D1Database, id: number, userEmail: string): Promise<void> {
  await db.prepare("DELETE FROM watchlist WHERE id = ? AND user_email = ?").bind(id, userEmail).run();
}

// thresholdKey distinguishes multiple concurrently-tracked thresholds of the
// same alert_type (each percent_change threshold in the list gets its own
// active/inactive state). price_high/price_low are single-valued, so they
// always use the default "" key.
export async function isAlertActive(
  db: D1Database,
  watchlistId: number,
  alertType: AlertType,
  thresholdKey = "",
): Promise<boolean> {
  const row = await db
    .prepare("SELECT active FROM alert_state WHERE watchlist_id = ? AND alert_type = ? AND threshold_key = ?")
    .bind(watchlistId, alertType, thresholdKey)
    .first<{ active: number }>();
  return row?.active === 1;
}

export async function setAlertActive(
  db: D1Database,
  watchlistId: number,
  alertType: AlertType,
  thresholdKey: string,
  active: boolean,
  lastValue: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO alert_state (watchlist_id, alert_type, threshold_key, active, last_value, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT (watchlist_id, alert_type, threshold_key)
       DO UPDATE SET active = excluded.active, last_value = excluded.last_value, updated_at = excluded.updated_at`,
    )
    .bind(watchlistId, alertType, thresholdKey, active ? 1 : 0, lastValue)
    .run();
}

export async function logAlert(
  db: D1Database,
  entry: Omit<AlertLogEntry, "id" | "sent_at">,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO alert_log (watchlist_id, user_email, symbol, alert_type, message, value)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(entry.watchlist_id, entry.user_email, entry.symbol, entry.alert_type, entry.message, entry.value)
    .run();
}

export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  try {
    const row = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string }>();
    return row?.value ?? null;
  } catch {
    // settings table may not exist yet
    return null;
  }
}

export async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value")
    .bind(key, value)
    .run();
}

export async function listAlertLog(db: D1Database, userEmail: string, limit = 50): Promise<AlertLogEntry[]> {
  const { results } = await db
    .prepare("SELECT * FROM alert_log WHERE user_email = ? ORDER BY sent_at DESC LIMIT ?")
    .bind(userEmail, limit)
    .all<AlertLogEntry>();
  return results;
}

// Scoped to the user via a join, since alert_state itself has no user_email column.
export async function listAlertStates(db: D1Database, userEmail: string): Promise<AlertStateEntry[]> {
  const { results } = await db
    .prepare(
      `SELECT a.watchlist_id, a.alert_type, a.threshold_key, a.active, a.last_value, a.updated_at
       FROM alert_state a
       JOIN watchlist w ON w.id = a.watchlist_id
       WHERE w.user_email = ?`,
    )
    .bind(userEmail)
    .all<AlertStateEntry>();
  return results;
}
