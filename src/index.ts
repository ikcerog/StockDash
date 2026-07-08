import { Hono } from "hono";
import type { AppEnv, Env } from "./types";
import { watchlistRoutes } from "./api/watchlist";
import { quotesRoutes } from "./api/quotes";
import { alertsRoutes } from "./api/alerts";
import { ratesRoutes } from "./api/rates";
import { runAlertCheck } from "./scheduled";
import { requireAccessJwt } from "./lib/access";

const app = new Hono<AppEnv>();

app.use("*", requireAccessJwt);
app.get("/api/me", (c) => c.json({ email: c.get("userEmail") }));
app.route("/api/watchlist", watchlistRoutes);
app.route("/api/quotes", quotesRoutes);
app.route("/api/alerts", alertsRoutes);
app.route("/api/rates", ratesRoutes);

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runAlertCheck(env));
  },
} satisfies ExportedHandler<Env>;
