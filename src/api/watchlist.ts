import { Hono } from "hono";
import type { AppEnv, WatchlistInput } from "../types";
import {
  createWatchlistItem,
  deleteWatchlistItem,
  ensureBaselineSeeded,
  listWatchlist,
  updateWatchlistItem,
} from "../lib/db";

export const watchlistRoutes = new Hono<AppEnv>();

const num = (v: unknown): number | null => (v === undefined || v === null || v === "" ? null : Number(v));

// Accepts a comma-separated list of percent thresholds (e.g. "1, 3, 5, 10")
// and normalizes it to a deduped, ascending, comma-separated string, so
// re-saving is idempotent and the cron check can split on "," directly.
function percentList(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const raw = String(v).trim();
  if (raw === "") return null;

  const parts = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s !== "");
  if (parts.length === 0) return null;

  const values = parts.map(Number);
  if (values.some((n) => !Number.isFinite(n) || n < 0)) {
    throw new Error("percent_change_threshold must be a comma-separated list of non-negative numbers, e.g. 1, 3, 5");
  }

  return [...new Set(values)].sort((a, b) => a - b).join(",");
}

function parseInput(body: unknown): WatchlistInput {
  const b = body as Record<string, unknown>;
  if (typeof b.symbol !== "string" || b.symbol.trim() === "") {
    throw new Error("symbol is required");
  }
  return {
    symbol: b.symbol.trim().toUpperCase(),
    label: typeof b.label === "string" ? b.label : null,
    shares: num(b.shares),
    price_high: num(b.price_high),
    price_low: num(b.price_low),
    percent_change_threshold: percentList(b.percent_change_threshold),
  };
}

function parsePartialInput(body: unknown): Partial<WatchlistInput> {
  const b = body as Record<string, unknown>;
  return {
    label: typeof b.label === "string" ? b.label : null,
    shares: num(b.shares),
    price_high: num(b.price_high),
    price_low: num(b.price_low),
    percent_change_threshold: percentList(b.percent_change_threshold),
  };
}

watchlistRoutes.get("/", async (c) => {
  await ensureBaselineSeeded(c.env.DB, c.get("userEmail"));
  const items = await listWatchlist(c.env.DB, c.get("userEmail"));
  return c.json(items);
});

watchlistRoutes.post("/", async (c) => {
  try {
    const input = parseInput(await c.req.json());
    const item = await createWatchlistItem(c.env.DB, c.get("userEmail"), input);
    return c.json(item, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    const status = message.includes("UNIQUE") ? 409 : 400;
    return c.json({ error: message }, status);
  }
});

watchlistRoutes.patch("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);
  try {
    const input = parsePartialInput(await c.req.json());
    const item = await updateWatchlistItem(c.env.DB, id, c.get("userEmail"), input);
    if (!item) return c.json({ error: "Not found" }, 404);
    return c.json(item);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid request";
    return c.json({ error: message }, 400);
  }
});

watchlistRoutes.delete("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) return c.json({ error: "Invalid id" }, 400);
  await deleteWatchlistItem(c.env.DB, id, c.get("userEmail"));
  return c.body(null, 204);
});
