import type { AlertType, Env, OneTimeAlert, WatchlistItem } from "./types";
import {
  isAlertActive,
  listAllWatchlist,
  listPendingOneTimeAlerts,
  logAlert,
  markOneTimeAlertTriggered,
  setAlertActive,
} from "./lib/db";
// alert_log.watchlist_id is a NOT NULL FK to watchlist(id), so one-time
// alerts — which don't have a backing watchlist row — can't share that log.
// The one_time_alerts.triggered_at column IS the log for those, and the
// UI reads both sources when rendering the notifications feed.
import { resolvePercentThresholds } from "./lib/alerts";
import { fetchQuotes, type Quote } from "./lib/yahoo";
import { sendAlertEmail } from "./lib/email";

interface Condition {
  type: AlertType;
  // Distinguishes which of several concurrent thresholds (of the same
  // alert_type) this condition tracks; price_high/price_low use "".
  thresholdKey: string;
  met: boolean;
  value: number;
  message: (item: WatchlistItem, quote: Quote) => string;
}

function evaluateConditions(item: WatchlistItem, quote: Quote): Condition[] {
  const conditions: Condition[] = [];

  if (item.price_high !== null) {
    conditions.push({
      type: "price_high",
      thresholdKey: "",
      met: quote.price >= item.price_high,
      value: quote.price,
      message: (i, q) =>
        `${i.symbol} hit $${q.price.toFixed(2)}, at or above your high threshold of $${i.price_high!.toFixed(2)}.`,
    });
  }

  if (item.price_low !== null) {
    conditions.push({
      type: "price_low",
      thresholdKey: "",
      met: quote.price <= item.price_low,
      value: quote.price,
      message: (i, q) =>
        `${i.symbol} dropped to $${q.price.toFixed(2)}, at or below your low threshold of $${i.price_low!.toFixed(2)}.`,
    });
  }

  // Includes DEFAULT_PERCENT_THRESHOLDS (currently 6.5% and 10%) on top of
  // the user's list, so every watchlist entry gets those alerts without any
  // per-user configuration.
  for (const threshold of resolvePercentThresholds(item.percent_change_threshold)) {
    conditions.push({
      type: "percent_change",
      thresholdKey: String(threshold),
      met: Math.abs(quote.changePercent) >= threshold,
      value: quote.changePercent,
      message: (i, q) =>
        `${i.symbol} moved ${q.changePercent >= 0 ? "+" : ""}${q.changePercent.toFixed(2)}% today, past your ${threshold}% threshold.`,
    });
  }

  return conditions;
}

async function processWatchlistItem(env: Env, item: WatchlistItem, quote: Quote): Promise<void> {
  for (const condition of evaluateConditions(item, quote)) {
    const wasActive = await isAlertActive(env.DB, item.id, condition.type, condition.thresholdKey);

    if (condition.met && !wasActive) {
      const message = condition.message(item, quote);
      try {
        await sendAlertEmail(
          env,
          item.user_email,
          `StockDash alert: ${item.symbol}`,
          `<p>${message}</p><p>Current price: $${quote.price.toFixed(2)} (${quote.changePercent >= 0 ? "+" : ""}${quote.changePercent.toFixed(2)}% today)</p>`,
        );
        await logAlert(env.DB, {
          watchlist_id: item.id,
          user_email: item.user_email,
          symbol: item.symbol,
          alert_type: condition.type,
          message,
          value: condition.value,
        });
      } catch (err) {
        console.error(`Failed to send alert email for ${item.symbol}/${condition.type}:`, err);
        continue; // leave alert_state inactive so we retry next tick
      }
      await setAlertActive(env.DB, item.id, condition.type, condition.thresholdKey, true, condition.value);
    } else if (!condition.met && wasActive) {
      await setAlertActive(env.DB, item.id, condition.type, condition.thresholdKey, false, condition.value);
    }
  }
}

function oneTimeAlertMet(alert: OneTimeAlert, quote: Quote): boolean {
  return alert.direction === "above" ? quote.price >= alert.price : quote.price <= alert.price;
}

async function processOneTimeAlert(env: Env, alert: OneTimeAlert, quote: Quote): Promise<void> {
  if (!oneTimeAlertMet(alert, quote)) return;

  const arrow = alert.direction === "above" ? "rose to" : "fell to";
  const message =
    `${alert.symbol} ${arrow} $${quote.price.toFixed(2)}, crossing your one-time ${alert.direction} $${alert.price.toFixed(2)} alert.` +
    (alert.note ? ` Note: ${alert.note}` : "");

  try {
    await sendAlertEmail(
      env,
      alert.user_email,
      `StockDash alert: ${alert.symbol}`,
      `<p>${message}</p><p>Current price: $${quote.price.toFixed(2)} (${quote.changePercent >= 0 ? "+" : ""}${quote.changePercent.toFixed(2)}% today)</p>`,
    );
  } catch (err) {
    console.error(`Failed to send one-time alert email for ${alert.symbol} (${alert.id}):`, err);
    return; // leave triggered_at NULL so we retry next tick
  }

  await markOneTimeAlertTriggered(env.DB, alert.id);
}

export async function runAlertCheck(env: Env): Promise<void> {
  const [watchlistItems, oneTimeAlerts] = await Promise.all([
    listAllWatchlist(env.DB),
    listPendingOneTimeAlerts(env.DB),
  ]);

  // Every watchlist entry has implicit percent-change thresholds now, so
  // there's no filtering to do — every row needs a quote.
  const symbols = new Set<string>();
  for (const item of watchlistItems) symbols.add(item.symbol);
  for (const alert of oneTimeAlerts) symbols.add(alert.symbol);
  if (symbols.size === 0) return;

  const quotes = await fetchQuotes([...symbols]);

  for (const item of watchlistItems) {
    const quote = quotes.get(item.symbol);
    if (!quote) continue;
    await processWatchlistItem(env, item, quote);
  }

  for (const alert of oneTimeAlerts) {
    const quote = quotes.get(alert.symbol);
    if (!quote) continue;
    await processOneTimeAlert(env, alert, quote);
  }
}
