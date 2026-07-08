import type { AlertLogEntry, AlertType, WatchlistInput, WatchlistItem } from "../types";

export async function listWatchlist(db: D1Database): Promise<WatchlistItem[]> {
  const { results } = await db.prepare("SELECT * FROM watchlist ORDER BY symbol ASC").all<WatchlistItem>();
  return results;
}

export async function getWatchlistItem(db: D1Database, id: number): Promise<WatchlistItem | null> {
  return db.prepare("SELECT * FROM watchlist WHERE id = ?").bind(id).first<WatchlistItem>();
}

export async function createWatchlistItem(db: D1Database, input: WatchlistInput): Promise<WatchlistItem> {
  const result = await db
    .prepare(
      `INSERT INTO watchlist (symbol, label, shares, price_high, price_low, percent_change_threshold)
       VALUES (?, ?, ?, ?, ?, ?)
       RETURNING *`,
    )
    .bind(
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
  input: Partial<WatchlistInput>,
): Promise<WatchlistItem | null> {
  const existing = await getWatchlistItem(db, id);
  if (!existing) return null;

  const merged = { ...existing, ...input };
  return db
    .prepare(
      `UPDATE watchlist
       SET label = ?, shares = ?, price_high = ?, price_low = ?, percent_change_threshold = ?
       WHERE id = ?
       RETURNING *`,
    )
    .bind(
      merged.label ?? null,
      merged.shares ?? null,
      merged.price_high ?? null,
      merged.price_low ?? null,
      merged.percent_change_threshold ?? null,
      id,
    )
    .first<WatchlistItem>();
}

export async function deleteWatchlistItem(db: D1Database, id: number): Promise<void> {
  await db.prepare("DELETE FROM watchlist WHERE id = ?").bind(id).run();
}

export async function isAlertActive(db: D1Database, watchlistId: number, alertType: AlertType): Promise<boolean> {
  const row = await db
    .prepare("SELECT active FROM alert_state WHERE watchlist_id = ? AND alert_type = ?")
    .bind(watchlistId, alertType)
    .first<{ active: number }>();
  return row?.active === 1;
}

export async function setAlertActive(
  db: D1Database,
  watchlistId: number,
  alertType: AlertType,
  active: boolean,
  lastValue: number,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO alert_state (watchlist_id, alert_type, active, last_value, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT (watchlist_id, alert_type)
       DO UPDATE SET active = excluded.active, last_value = excluded.last_value, updated_at = excluded.updated_at`,
    )
    .bind(watchlistId, alertType, active ? 1 : 0, lastValue)
    .run();
}

export async function logAlert(
  db: D1Database,
  entry: Omit<AlertLogEntry, "id" | "sent_at">,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO alert_log (watchlist_id, symbol, alert_type, message, value)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(entry.watchlist_id, entry.symbol, entry.alert_type, entry.message, entry.value)
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

export async function listAlertLog(db: D1Database, limit = 50): Promise<AlertLogEntry[]> {
  const { results } = await db
    .prepare("SELECT * FROM alert_log ORDER BY sent_at DESC LIMIT ?")
    .bind(limit)
    .all<AlertLogEntry>();
  return results;
}
