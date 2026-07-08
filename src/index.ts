import { Hono } from "hono";
import type { Env } from "./types";
import { watchlistRoutes } from "./api/watchlist";
import { quotesRoutes } from "./api/quotes";
import { alertsRoutes } from "./api/alerts";
import { runAlertCheck } from "./scheduled";

const app = new Hono<{ Bindings: Env }>();

app.route("/api/watchlist", watchlistRoutes);
app.route("/api/quotes", quotesRoutes);
app.route("/api/alerts", alertsRoutes);

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runAlertCheck(env));
  },
} satisfies ExportedHandler<Env>;
