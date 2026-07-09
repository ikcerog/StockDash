import { Hono } from "hono";
import type { AppEnv } from "../types";
import { fetchHistory } from "../lib/yahoo";

export const historyRoutes = new Hono<AppEnv>();

historyRoutes.get("/:symbol", async (c) => {
  const symbol = c.req.param("symbol").toUpperCase();
  const range = c.req.query("range") ?? "6mo";
  const points = await fetchHistory(symbol, range);
  return c.json({ symbol, points });
});
