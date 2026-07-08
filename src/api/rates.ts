import { Hono } from "hono";
import type { Env } from "../types";
import { getSetting } from "../lib/db";
import { fetchRates } from "../lib/fred";

export const ratesRoutes = new Hono<{ Bindings: Env }>();

ratesRoutes.get("/", async (c) => {
  // Prefer the Workers secret; fall back to the key stored in D1 settings.
  const apiKey = c.env.FRED_API_KEY || (await getSetting(c.env.DB, "FRED_API_KEY"));
  if (!apiKey) {
    return c.json({ error: "FRED API key is not configured" }, 503);
  }

  try {
    return c.json(await fetchRates(apiKey));
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "FRED request failed" }, 502);
  }
});
