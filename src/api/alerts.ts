import { Hono } from "hono";
import type { Env } from "../types";
import { listAlertLog } from "../lib/db";
import { sendAlertEmail } from "../lib/resend";

export const alertsRoutes = new Hono<{ Bindings: Env }>();

alertsRoutes.get("/", async (c) => {
  const limit = Number(c.req.query("limit") ?? "50");
  const entries = await listAlertLog(c.env.DB, Number.isFinite(limit) ? limit : 50);
  return c.json(entries);
});

alertsRoutes.post("/test", async (c) => {
  try {
    await sendAlertEmail(
      c.env,
      "StockDash test alert",
      `<p>This is a test email from StockDash. If you're reading this, alert delivery is working.</p>`,
    );
    return c.json({ ok: true, to: c.env.ALERT_EMAIL });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Failed to send test email" }, 502);
  }
});
