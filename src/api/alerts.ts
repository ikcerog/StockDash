import { Hono } from "hono";
import type { AppEnv } from "../types";
import { listAlertLog } from "../lib/db";
import { sendAlertEmail } from "../lib/resend";

export const alertsRoutes = new Hono<AppEnv>();

alertsRoutes.get("/", async (c) => {
  const limit = Number(c.req.query("limit") ?? "50");
  const entries = await listAlertLog(c.env.DB, c.get("userEmail"), Number.isFinite(limit) ? limit : 50);
  return c.json(entries);
});

alertsRoutes.post("/test", async (c) => {
  const to = c.get("userEmail");
  try {
    await sendAlertEmail(
      c.env,
      to,
      "StockDash test alert",
      `<p>This is a test email from StockDash. If you're reading this, alert delivery is working.</p>`,
    );
    return c.json({ ok: true, to });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Failed to send test email" }, 502);
  }
});
