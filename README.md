# StockDash

A small stock/portfolio watchlist tracker that runs entirely on Cloudflare
(Workers + D1), with email alerts for fixed price thresholds and percent-change
moves.

- **Frontend**: static HTML/CSS/JS dashboard (`public/`) served by the Worker.
- **API**: Hono routes under `/api/*` for managing the watchlist and reading
  quotes/alert history (`src/`).
- **Prices**: pulled live from Yahoo Finance's unofficial chart endpoint (no
  API key needed).
- **Alerts**: a Cron Trigger runs every 15 minutes during US market hours,
  checks each tracked stock against its thresholds, and emails you via
  [Resend](https://resend.com) when a condition is newly crossed.
- **Storage**: Cloudflare D1 (SQLite) holds the watchlist, alert state, and
  alert history.

## One-time setup

You'll need:
- A Cloudflare account, authenticated via `npx wrangler login` (or a
  `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` env var pair with Workers
  Scripts + D1 edit permissions).
- A free [Resend](https://resend.com) account and API key. No domain
  verification is required if you're only ever emailing the account owner's
  own address using the shared `onboarding@resend.dev` sender (already the
  default in `wrangler.toml`).

```bash
npm install

# Create the D1 database, then copy the returned database_id into
# wrangler.toml (replacing REPLACE_AFTER_D1_CREATE).
npx wrangler d1 create stockdash-db

# Apply the schema
npm run db:migrate:remote

# Set your Resend API key as a secret (never put this in wrangler.toml)
npx wrangler secret put RESEND_API_KEY

# Adjust ALERT_EMAIL / ALERT_FROM_EMAIL in wrangler.toml [vars] if needed,
# then deploy
npm run deploy
```

After deploying, `wrangler` prints your Worker's `*.workers.dev` URL — open
it to use the dashboard.

## Local development

```bash
npm run db:migrate:local
npm run dev
```

`wrangler dev` runs the Worker against a local D1 instance and serves the
static assets. Scheduled (cron) runs can be triggered manually by hitting
the dev server's `/cdn-cgi/handler/scheduled` endpoint, or via
`npx wrangler dev --test-scheduled`.

## How alerts work

Each watchlist entry can have any combination of:
- **Price high** — email when the price rises to or above this value.
- **Price low** — email when the price falls to or below this value.
- **% change threshold** — email when the day's price move (vs. previous
  close) exceeds this percentage in either direction.

The cron handler (`src/scheduled.ts`) only sends an email on the transition
into a triggered state — it won't re-email every 15 minutes while a
condition continues to hold, but will re-arm and alert again if the
condition clears and is crossed again later (e.g. a new trading day).

## Adjusting the tracked stocks

Add, edit, or remove stocks and their thresholds directly from the
dashboard UI — no redeploy needed. Symbols are Yahoo Finance tickers (e.g.
`AAPL`, `MSFT`, `VOO`).
