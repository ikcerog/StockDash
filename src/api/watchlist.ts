import { Hono } from "hono";
import type { Env, WatchlistInput } from "../types";
import { createWatchlistItem, deleteWatchlistItem, listWatchlist, updateWatchlistItem } from "../lib/db";

export const watchlistRoutes = new Hono<{ Bindings: Env }>();

const num = (v: unknown): number | null => (v === undefined || v === null || v === "" ? null : Number(v));

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
    percent_change_threshold: num(b.percent_change_threshold),
  };
}

function parsePartialInput(body: unknown): Partial<WatchlistInput> {
  const b = body as Record<string, unknown>;
  return {
    label: typeof b.label === "string" ? b.label : null,
    shares: num(b.shares),
    price_high: num(b.price_high),
    price_low: num(b.price_low),
    percent_change_threshold: num(b.percent_change_threshold),
  };
}

watchlistRoutes.get("/", async (c) => {
  const items = await listWatchlist(c.env.DB);
  return c.json(items);
});

watchlistRoutes.post("/", async (c) => {
  try {
    const input = parseInput(await c.req.json());
    const item = await createWatchlistItem(c.env.DB, input);
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
    const item = await updateWatchlistItem(c.env.DB, id, input);
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
  await deleteWatchlistItem(c.env.DB, id);
  return c.body(null, 204);
});
