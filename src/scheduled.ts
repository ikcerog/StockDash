import type { AlertType, Env, WatchlistItem } from "./types";
import { isAlertActive, listAllWatchlist, logAlert, setAlertActive } from "./lib/db";
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

// item.percent_change_threshold is a normalized comma-separated list, e.g. "1,3,5,10".
function parsePercentThresholds(raw: string | null): number[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
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

  for (const threshold of parsePercentThresholds(item.percent_change_threshold)) {
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

export async function runAlertCheck(env: Env): Promise<void> {
  const items = await listAllWatchlist(env.DB);
  const withThresholds = items.filter(
    (item) => item.price_high !== null || item.price_low !== null || item.percent_change_threshold !== null,
  );
  if (withThresholds.length === 0) return;

  const quotes = await fetchQuotes(withThresholds.map((item) => item.symbol));

  for (const item of withThresholds) {
    const quote = quotes.get(item.symbol);
    if (!quote) continue;

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
}
