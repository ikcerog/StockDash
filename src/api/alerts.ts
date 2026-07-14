import { Hono } from "hono";
import type { AppEnv, OneTimeAlertInput } from "../types";
import {
  createOneTimeAlert,
  deleteOneTimeAlert,
  listAlertLog,
  listAlertStates,
  listOneTimeAlerts,
} from "../lib/db";
import { DEFAULT_ALERT_SYMBOLS, DEFAULT_PERCENT_THRESHOLDS } from "../lib/alerts";
import { sendAlertEmail } from "../lib/email";

export const alertsRoutes = new Hono<AppEnv>();

alertsRoutes.get("/", async (c) => {
  const limit = Number(c.req.query("limit") ?? "50");
  const entries = await listAlertLog(c.env.DB, c.get("userEmail"), Number.isFinite(limit) ? limit : 50);
  return c.json(entries);
});

// State of each configured threshold, so the UI can tell which alerts are
// still armed/waiting to fire versus already triggered and currently holding.
alertsRoutes.get("/state", async (c) => {
  const states = await listAlertStates(c.env.DB, c.get("userEmail"));
  return c.json(states);
});

// The implicit percent-change thresholds, plus the symbols they apply to,
// on top of any user-configured percent_change_threshold on the row. UI
// reads this so it can render them alongside custom thresholds without
// hardcoding the list.
alertsRoutes.get("/defaults", (c) => {
  return c.json({
    percent_change: DEFAULT_PERCENT_THRESHOLDS,
    symbols: DEFAULT_ALERT_SYMBOLS,
  });
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

// --- One-time alerts ---

function parseOneTimeInput(body: unknown): OneTimeAlertInput {
  const b = body as Record<string, unknown>;
  if (typeof b.symbol !== "string" || b.symbol.trim() === "") {
    throw new Error("symbol is required");
  }
  if (b.direction !== "above" && b.direction !== "below") {
    throw new Error("direction must be 'above' or 'below'");
  }
  const price = Number(b.price);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("price must be a positive number");
  }
  return {
    symbol: b.symbol.trim().toUpperCase(),
    direction: b.direction,
    price,
    note: typeof b.note === "string" && b.note.trim() !== "" ? b.note.trim() : null,
  };
}

alertsRoutes.get("/one-time", async (c) => {
  const entries = await listOneTimeAlerts(c.env.DB, c.get("userEmail"));
  return c.json(entries);
});

alertsRoutes.post("/one-time", async (c) => {
  try {
    const input = parseOneTimeInput(await c.req.json());
    const alert = await createOneTimeAlert(c.env.DB, c.get("userEmail"), input);
    return c.json(alert, 201);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Invalid request" }, 400);
  }
});

alertsRoutes.delete("/one-time/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);
  await deleteOneTimeAlert(c.env.DB, id, c.get("userEmail"));
  return c.body(null, 204);
});
