import { Hono } from "hono";
import type { Env } from "../types";
import { listWatchlist } from "../lib/db";
import { fetchQuotes } from "../lib/yahoo";

export const quotesRoutes = new Hono<{ Bindings: Env }>();

quotesRoutes.get("/", async (c) => {
  const items = await listWatchlist(c.env.DB);
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
