import { Hono } from "hono";
import type { AppEnv } from "../types";
import { ensureBaselineSeeded, listWatchlist } from "../lib/db";
import { fetchQuotes } from "../lib/yahoo";

export const quotesRoutes = new Hono<AppEnv>();

quotesRoutes.get("/", async (c) => {
  await ensureBaselineSeeded(c.env.DB, c.get("userEmail"));
  const items = await listWatchlist(c.env.DB, c.get("userEmail"));
  const quotes = await fetchQuotes(items.map((item) => item.symbol));

  const rows = items.map((item) => {
    const quote = quotes.get(item.symbol) ?? null;
    return {
      ...item,
      quote,
      market_value: quote && item.shares ? quote.price * item.shares : null,
    };
  });

  return c.json(rows);
});
