import { Hono } from "hono";
import type { Env } from "../types";
import { fetchFeedWithFallback, type FeedItem, type FeedSource } from "../lib/rssFeed";

export const newsRoutes = new Hono<{ Bindings: Env }>();

const NEWS_QUERY =
  '(mortgage OR "Rocket Companies" OR "UWM Holdings" OR "United Wholesale Mortgage" OR "mortgage rates") when:3d';

const RELEVANCE_KEYWORDS = ["mortgage", "rocket", "uwm", "wholesale", "home loan", "refinance", "housing market"];

function isRelevant(item: FeedItem): boolean {
  const haystack = item.title.toLowerCase();
  return RELEVANCE_KEYWORDS.some((k) => haystack.includes(k));
}

// Tried in order; the first source that yields any items wins. Google News
// is query-filtered and usually the best match, but its RSS endpoint
// intermittently rate-limits/blocks cloud egress IPs (including Cloudflare
// Workers').
const NEWS_SOURCES: FeedSource[] = [
  {
    name: "Google News",
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(NEWS_QUERY)}&hl=en-US&gl=US&ceid=US:en`,
    filterRelevant: false,
  },
  { name: "HousingWire", url: "https://www.housingwire.com/feed/", filterRelevant: true },
  { name: "CNBC Real Estate", url: "https://www.cnbc.com/id/10000115/device/rss/rss.html", filterRelevant: true },
];

newsRoutes.get("/", async (c) => {
  const result = await fetchFeedWithFallback(c.env.DB, NEWS_SOURCES, {
    cacheKey: "NEWS_CACHE",
    relevanceCheck: isRelevant,
    maxAgeDays: 7,
    limit: 5,
  });

  if (result.items.length === 0) {
    return c.json({ error: "News feed unavailable and no cached headlines yet" }, 502);
  }
  return c.json(result);
});
