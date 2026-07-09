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
  checks each tracked stock against its thresholds, and emails the owning
  user via [Brevo](https://www.brevo.com) (preferred) or
  [Resend](https://resend.com) (fallback) when a condition is newly crossed.
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

## Authentication (Cloudflare Access)

The deployed Worker sits behind [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/access-controls/):
the `workers.dev` route is set to **Restricted** in the Workers dashboard
(Domains tab), so visitors must sign in before reaching the app. As defense
in depth, the Worker also verifies the `Cf-Access-Jwt-Assertion` header on
every request it handles (`src/lib/access.ts`) — if the route were ever
flipped back to Public, the API would still reject unauthenticated requests.

`ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` in `wrangler.toml` identify the Access
application; update `ACCESS_AUD` if the Access app is ever deleted and
recreated (the AUD tag is shown in the Restricted dialog on the Domains tab,
or under Zero Trust > Access > Applications).

## Accounts / multiple users

There is no separate account system: a user's identity is the verified
email in their Access JWT. Watchlists, thresholds, alert history, and alert
emails are all scoped to that email (`user_email` columns in D1), so each
signed-in user sees only their own data and gets alerts at their own
address.

To add a user, add their email to the Access application's allow policy
(Zero Trust > Access > Applications, or Manage Cloudflare Access from the
Worker's Domains tab). They sign in with the same one-time-PIN flow — no
signup or password anywhere.

**Email provider**: `src/lib/email.ts` sends via
[Brevo](https://www.brevo.com) if `BREVO_API_KEY` and `BREVO_SENDER_EMAIL`
are set (as D1 `settings` rows, same pattern as the FRED/Resend keys — see
`getSetting`/D1 `settings` table), otherwise it falls back to Resend.
Brevo's free tier verifies a single sender address (click a confirmation
link — no domain/DNS needed) and can then deliver to any recipient, which
is why it's preferred over Resend's `onboarding@resend.dev` sender, which
is sandboxed to the Resend account owner's own address until a full domain
is verified.

## Local development

```bash
npm run db:migrate:local
npm run dev
```

`wrangler dev` has no Access layer in front of it, so requests carry no
Access JWT. Create a `.dev.vars` file (gitignored) to bypass the JWT check
locally:

```
ACCESS_DEV_BYPASS=true
# Optional: which user to act as locally (defaults to dev@localhost)
ACCESS_DEV_EMAIL=johnagorecki@gmail.com
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

## Dashboard preferences

These are per-browser (stored in `localStorage`), not per-account, so they
don't follow you across devices:
- **Columns** — show/hide individual watchlist columns.
- **Theme** — light/dark toggle in the top bar; defaults to your OS setting
  until you override it.
- **Chart** — "Show chart" opens an optional price-history pane next to the
  watchlist (click a symbol in the table, or use the dropdown, to change
  what it plots). Backed by `GET /api/history/:symbol?range=`, which pulls
  from the same Yahoo endpoint as live quotes.

Click the version chip in the top bar for patch notes.
