import { Hono } from "hono";
import type { Env } from "../types";
import { listAlertLog } from "../lib/db";

export const alertsRoutes = new Hono<{ Bindings: Env }>();

alertsRoutes.get("/", async (c) => {
  const limit = Number(c.req.query("limit") ?? "50");
  const entries = await listAlertLog(c.env.DB, Number.isFinite(limit) ? limit : 50);
  return c.json(entries);
});
