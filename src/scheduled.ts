import type { AlertType, Env, WatchlistItem } from "./types";
import { isAlertActive, listWatchlist, logAlert, setAlertActive } from "./lib/db";
import { fetchQuotes, type Quote } from "./lib/yahoo";
import { sendAlertEmail } from "./lib/resend";

interface Condition {
  type: AlertType;
  met: boolean;
  value: number;
  message: (item: WatchlistItem, quote: Quote) => string;
}

function evaluateConditions(item: WatchlistItem, quote: Quote): Condition[] {
  const conditions: Condition[] = [];

  if (item.price_high !== null) {
    conditions.push({
      type: "price_high",
      met: quote.price >= item.price_high,
      value: quote.price,
      message: (i, q) =>
        `${i.symbol} hit $${q.price.toFixed(2)}, at or above your high threshold of $${i.price_high!.toFixed(2)}.`,
    });
  }

  if (item.price_low !== null) {
    conditions.push({
      type: "price_low",
      met: quote.price <= item.price_low,
      value: quote.price,
      message: (i, q) =>
        `${i.symbol} dropped to $${q.price.toFixed(2)}, at or below your low threshold of $${i.price_low!.toFixed(2)}.`,
    });
  }

  if (item.percent_change_threshold !== null) {
    conditions.push({
      type: "percent_change",
      met: Math.abs(quote.changePercent) >= item.percent_change_threshold,
      value: quote.changePercent,
      message: (i, q) =>
        `${i.symbol} moved ${q.changePercent >= 0 ? "+" : ""}${q.changePercent.toFixed(2)}% today, past your ${i.percent_change_threshold!.toFixed(2)}% threshold.`,
    });
  }

  return conditions;
}

export async function runAlertCheck(env: Env): Promise<void> {
  const items = await listWatchlist(env.DB);
  const withThresholds = items.filter(
    (item) => item.price_high !== null || item.price_low !== null || item.percent_change_threshold !== null,
  );
  if (withThresholds.length === 0) return;

  const quotes = await fetchQuotes(withThresholds.map((item) => item.symbol));

  for (const item of withThresholds) {
    const quote = quotes.get(item.symbol);
    if (!quote) continue;

    for (const condition of evaluateConditions(item, quote)) {
      const wasActive = await isAlertActive(env.DB, item.id, condition.type);

      if (condition.met && !wasActive) {
        const message = condition.message(item, quote);
        try {
          await sendAlertEmail(
            env,
            `StockDash alert: ${item.symbol}`,
            `<p>${message}</p><p>Current price: $${quote.price.toFixed(2)} (${quote.changePercent >= 0 ? "+" : ""}${quote.changePercent.toFixed(2)}% today)</p>`,
          );
          await logAlert(env.DB, {
            watchlist_id: item.id,
            symbol: item.symbol,
            alert_type: condition.type,
            message,
            value: condition.value,
          });
        } catch (err) {
          console.error(`Failed to send alert email for ${item.symbol}/${condition.type}:`, err);
          continue; // leave alert_state inactive so we retry next tick
        }
        await setAlertActive(env.DB, item.id, condition.type, true, condition.value);
      } else if (!condition.met && wasActive) {
        await setAlertActive(env.DB, item.id, condition.type, false, condition.value);
      }
    }
  }
}
