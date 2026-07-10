import { Hono } from "hono";
import type { Env } from "../types";
import { getSetting, setSetting } from "../lib/db";
import { fetchFeedWithFallback, type FeedItem, type FeedSource } from "../lib/rssFeed";

export const trendingRoutes = new Hono<{ Bindings: Env }>();

// --- Topics: housing / fintech / AI / Detroit, via RSS ---

const TOPICS_QUERY = '(housing OR "real estate" OR fintech OR "artificial intelligence" OR Detroit) when:2d';

// Longer, distinctive terms are matched as plain substrings; "ai" alone is
// short enough to false-positive inside ordinary words ("said", "main"),
// so it's matched as a whole word instead.
const RELEVANCE_PATTERNS = [
  /housing/i,
  /real estate/i,
  /fintech/i,
  /detroit/i,
  /home price/i,
  /interest rate/i,
  /artificial intelligence/i,
  /\bai\b/i,
];

function isTopicRelevant(item: FeedItem): boolean {
  return RELEVANCE_PATTERNS.some((p) => p.test(item.title));
}

const TOPICS_SOURCES: FeedSource[] = [
  {
    name: "Google News",
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(TOPICS_QUERY)}&hl=en-US&gl=US&ceid=US:en`,
    filterRelevant: false,
  },
  { name: "TechCrunch", url: "https://techcrunch.com/feed/", filterRelevant: true },
  { name: "Crain's Detroit Business", url: "https://www.crainsdetroit.com/rss.xml", filterRelevant: true },
];

trendingRoutes.get("/topics", async (c) => {
  const result = await fetchFeedWithFallback(c.env.DB, TOPICS_SOURCES, {
    cacheKey: "TRENDING_TOPICS",
    relevanceCheck: isTopicRelevant,
    maxAgeDays: 3,
    limit: 8,
  });

  if (result.items.length === 0) {
    return c.json({ error: "Trending topics unavailable and no cached data yet" }, 502);
  }
  return c.json(result);
});

// --- Markets: trending Polymarket prediction markets ---
// Best-effort against Polymarket's public Gamma API (no key/signup
// required). Parsing is defensive since this hasn't been verified against
// a live response in this environment; any market that doesn't match the
// expected shape is skipped rather than breaking the whole list, and the
// route falls back to the last cached result (same pattern as the RSS
// feeds) if the live fetch fails entirely.

interface MarketItem {
  title: string;
  link: string;
  source: string;
}

const MARKETS_CACHE_KEY = "TRENDING_MARKETS_ITEMS";
const MARKETS_CACHE_TIME_KEY = "TRENDING_MARKETS_FETCHED_AT";
// Fetch a wide pool sorted by 24h volume, then filter it down to
// housing/economy-relevant markets client-side (see MARKET_RELEVANCE_PATTERNS
// below) rather than relying on Polymarket's own category tags, which aren't
// verified against a live response in this environment.
const MARKETS_URL =
  "https://gamma-api.polymarket.com/markets?active=true&closed=false&order=volume24hr&ascending=false&limit=100";
// Ticker shows on-topic markets first, then backfills remaining slots with
// general top-volume markets so it's never sparse on days when few
// housing/Fed markets are actively trading.
const TICKER_SIZE = 10;

const MARKET_RELEVANCE_PATTERNS = [
  /housing/i,
  /real estate/i,
  /mortgage/i,
  /home price/i,
  /home sales/i,
  /rent/i,
  /\bfed\b/i,
  /federal reserve/i,
  /powell/i,
  /interest rate/i,
  /rate (cut|hike|decision)/i,
  /inflation/i,
  /\bcpi\b/i,
  /\bgdp\b/i,
  /recession/i,
  /unemployment/i,
  /jobs report/i,
  /jobless/i,
  /treasury/i,
  /yield/i,
];

function isMarketRelevant(item: MarketItem): boolean {
  return MARKET_RELEVANCE_PATTERNS.some((p) => p.test(item.title));
}

function parseMarket(raw: unknown): MarketItem | null {
  if (typeof raw !== "object" || raw === null) return null;
  const m = raw as Record<string, unknown>;

  const question = typeof m.question === "string" ? m.question.trim() : null;
  const slug = typeof m.slug === "string" ? m.slug : null;
  if (!question || !slug) return null;

  let title = question;
  try {
    const outcomes = JSON.parse(typeof m.outcomes === "string" ? m.outcomes : "[]") as unknown;
    const prices = JSON.parse(typeof m.outcomePrices === "string" ? m.outcomePrices : "[]") as unknown;
    if (Array.isArray(prices) && prices.length > 0) {
      const pct = Math.round(Number(prices[0]) * 100);
      if (Number.isFinite(pct)) {
        const outcomeLabel = Array.isArray(outcomes) && typeof outcomes[0] === "string" ? outcomes[0] : "Yes";
        title = `${question} — ${pct}% ${outcomeLabel}`;
      }
    }
  } catch {
    // Shape didn't match what's expected -- fall back to the bare question.
  }

  return { title, link: `https://polymarket.com/event/${slug}`, source: "Polymarket" };
}

trendingRoutes.get("/markets", async (c) => {
  try {
    const res = await fetch(MARKETS_URL, { headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(String(res.status));
    const raw = (await res.json()) as unknown[];
    if (!Array.isArray(raw)) throw new Error("unexpected response shape");

    const parsed = raw.map(parseMarket).filter((m): m is MarketItem => m !== null);

    // Already sorted by 24h volume (via the API's `order` param); lead with
    // on-topic markets and backfill with general top-volume ones if there
    // aren't enough to fill the ticker.
    const relevant = parsed.filter(isMarketRelevant);
    const rest = parsed.filter((m) => !isMarketRelevant(m));
    const items = [...relevant, ...rest].slice(0, TICKER_SIZE);
    if (items.length === 0) throw new Error("no usable markets in response");

    await setSetting(c.env.DB, MARKETS_CACHE_KEY, JSON.stringify(items));
    await setSetting(c.env.DB, MARKETS_CACHE_TIME_KEY, new Date().toISOString());
    return c.json({ items, source: "Polymarket" });
  } catch {
    const cached = await getSetting(c.env.DB, MARKETS_CACHE_KEY);
    if (cached) {
      const fetchedAt = await getSetting(c.env.DB, MARKETS_CACHE_TIME_KEY);
      return c.json({ items: JSON.parse(cached) as MarketItem[], stale: true, fetchedAt });
    }
    return c.json({ error: "Trending markets unavailable and no cached data yet" }, 502);
  }
});
