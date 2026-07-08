import { Hono } from "hono";
import type { Env } from "../types";
import { fetchRates } from "../lib/fred";

export const ratesRoutes = new Hono<{ Bindings: Env }>();

ratesRoutes.get("/", async (c) => {
  if (!c.env.FRED_API_KEY) {
    return c.json({ error: "FRED_API_KEY secret is not configured" }, 503);
  }

  try {
    return c.json(await fetchRates(c.env.FRED_API_KEY));
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "FRED request failed" }, 502);
  }
});
