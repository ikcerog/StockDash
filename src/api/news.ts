import { Hono } from "hono";
import type { Env } from "../types";
import { getSetting, setSetting } from "../lib/db";

export const newsRoutes = new Hono<{ Bindings: Env }>();

interface NewsItem {
  title: string;
  source: string | null;
  link: string;
  pubDate: string | null;
}

const NEWS_CACHE_KEY = "NEWS_CACHE";
const NEWS_CACHE_TIME_KEY = "NEWS_CACHE_FETCHED_AT";

const NEWS_QUERY =
  '(mortgage OR "Rocket Companies" OR "UWM Holdings" OR "United Wholesale Mortgage" OR "mortgage rates") when:3d';

const RELEVANCE_KEYWORDS = ["mortgage", "rocket", "uwm", "wholesale", "home loan", "refinance", "housing market"];

const MAX_AGE_DAYS = 7;

// Tried in order; the first source that yields any items wins. Google News
// is query-filtered and usually the best match, but its RSS endpoint
// intermittently rate-limits/blocks cloud egress IPs (including Cloudflare
// Workers'). The publisher feeds below aren't query-filtered, so their
// results are filtered for relevance client-side instead.
const NEWS_SOURCES: { name: string; url: string; filterRelevant: boolean }[] = [
  {
    name: "Google News",
    url: `https://news.google.com/rss/search?q=${encodeURIComponent(NEWS_QUERY)}&hl=en-US&gl=US&ceid=US:en`,
    filterRelevant: false,
  },
  { name: "HousingWire", url: "https://www.housingwire.com/feed/", filterRelevant: true },
  { name: "CNBC Real Estate", url: "https://www.cnbc.com/id/10000115/device/rss/rss.html", filterRelevant: true },
];

// Google News RSS titles are formatted "Headline - Source"; split off the
// trailing source name rather than showing it duplicated in the headline.
// Other feeds don't follow that convention, so the split is harmlessly a
// no-op there.
function parseRssItems(xml: string, limit: number): NewsItem[] {
  const items: NewsItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(xml)) && items.length < limit) {
    const block = match[1];
    const rawTitle = block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "";
    const title = rawTitle.replace(/^<!\[CDATA\[|\]\]>$/g, "").trim();
    const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() ?? "";
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? null;
    if (!title || !link) continue;

    const sepIdx = title.lastIndexOf(" - ");
    const headline = sepIdx > 0 ? title.slice(0, sepIdx) : title;
    const source = sepIdx > 0 ? title.slice(sepIdx + 3) : null;

    items.push({ title: headline, source, link, pubDate });
  }
  return items;
}

function isRelevant(item: NewsItem): boolean {
  const haystack = item.title.toLowerCase();
  return RELEVANCE_KEYWORDS.some((k) => haystack.includes(k));
}

// Google's own query already scopes to `when:3d`, but the publisher feeds
// (HousingWire/CNBC) aren't date-scoped at all, so this is enforced
// uniformly across every source rather than trusting each feed's own
// freshness. Items with no parseable pubDate are dropped rather than
// assumed recent.
function isRecent(item: NewsItem): boolean {
  if (!item.pubDate) return false;
  const published = new Date(item.pubDate).getTime();
  if (Number.isNaN(published)) return false;
  return Date.now() - published <= MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

async function fetchFeed(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "application/rss+xml, application/xml, text/xml, */*",
    },
  });
  if (!res.ok) throw new Error(String(res.status));
  return res.text();
}

newsRoutes.get("/", async (c) => {
  for (const source of NEWS_SOURCES) {
    try {
      const xml = await fetchFeed(source.url);
      let items = parseRssItems(xml, source.filterRelevant ? 20 : 10);
      if (source.filterRelevant) items = items.filter(isRelevant);
      items = items.filter(isRecent).slice(0, 5);
      if (items.length === 0) continue;

      await setSetting(c.env.DB, NEWS_CACHE_KEY, JSON.stringify(items));
      await setSetting(c.env.DB, NEWS_CACHE_TIME_KEY, new Date().toISOString());
      return c.json({ items, source: source.name });
    } catch {
      continue; // try the next source
    }
  }

  // Every live source failed or returned nothing relevant -- fall back to
  // the last successful fetch instead of erroring out.
  const cached = await getSetting(c.env.DB, NEWS_CACHE_KEY);
  if (cached) {
    const fetchedAt = await getSetting(c.env.DB, NEWS_CACHE_TIME_KEY);
    return c.json({ items: JSON.parse(cached) as NewsItem[], stale: true, fetchedAt });
  }

  return c.json({ error: "News feed unavailable and no cached headlines yet" }, 502);
});
