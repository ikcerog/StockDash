import { getSetting, setSetting } from "./db";

export interface FeedItem {
  title: string;
  source: string | null;
  link: string;
  pubDate: string | null;
}

export interface FeedSource {
  name: string;
  url: string;
  // Publisher feeds aren't scoped to a search query the way Google News is,
  // so their items are filtered for relevance client-side instead.
  filterRelevant: boolean;
}

// RSS titles from aggregators (Google News) are formatted "Headline -
// Source"; split that off rather than showing it duplicated in the
// headline. Publisher feeds don't follow that convention, so the split is
// harmlessly a no-op there and the source name is filled in by the caller.
export function parseRssItems(xml: string, limit: number): FeedItem[] {
  const items: FeedItem[] = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;
  while ((match = itemRe.exec(xml)) && items.length < limit) {
    const block = match[1];
    const rawTitle = block.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "";
    const title = rawTitle.replace(/^<!\[CDATA\[|\]\]>$/g, "").trim();
    const rawLink = block.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() ?? "";
    const link = rawLink.replace(/^<!\[CDATA\[|\]\]>$/g, "").trim();
    const pubDate = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() ?? null;
    if (!title || !link) continue;

    const sepIdx = title.lastIndexOf(" - ");
    const headline = sepIdx > 0 ? title.slice(0, sepIdx) : title;
    const source = sepIdx > 0 ? title.slice(sepIdx + 3) : null;

    items.push({ title: headline, source, link, pubDate });
  }
  return items;
}

export function isRecent(item: FeedItem, maxAgeDays: number): boolean {
  if (!item.pubDate) return false;
  const published = new Date(item.pubDate).getTime();
  if (Number.isNaN(published)) return false;
  return Date.now() - published <= maxAgeDays * 24 * 60 * 60 * 1000;
}

async function fetchFeedXml(url: string): Promise<string> {
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

export interface FeedResult {
  items: FeedItem[];
  source?: string;
  stale?: boolean;
  fetchedAt?: string | null;
}

// Tries each source in order, returning the first that yields any items
// (after relevance/recency filtering) and caching that result in D1. If
// every live source fails or is empty, falls back to the last cached
// result rather than returning nothing -- a transient block on one feed
// (a real, observed failure mode with Google News RSS from cloud egress
// IPs) shouldn't leave a ticker empty.
export async function fetchFeedWithFallback(
  db: D1Database,
  sources: FeedSource[],
  opts: { cacheKey: string; relevanceCheck: (item: FeedItem) => boolean; maxAgeDays: number; limit: number },
): Promise<FeedResult> {
  const cacheKey = `${opts.cacheKey}_ITEMS`;
  const cacheTimeKey = `${opts.cacheKey}_FETCHED_AT`;

  for (const source of sources) {
    try {
      const xml = await fetchFeedXml(source.url);
      let items = parseRssItems(xml, source.filterRelevant ? 20 : 10);
      if (source.filterRelevant) items = items.filter(opts.relevanceCheck);
      items = items
        .filter((item) => isRecent(item, opts.maxAgeDays))
        .map((item) => ({ ...item, source: item.source ?? source.name }))
        .slice(0, opts.limit);
      if (items.length === 0) continue;

      await setSetting(db, cacheKey, JSON.stringify(items));
      await setSetting(db, cacheTimeKey, new Date().toISOString());
      return { items, source: source.name };
    } catch {
      continue; // try the next source
    }
  }

  const cached = await getSetting(db, cacheKey);
  if (cached) {
    const fetchedAt = await getSetting(db, cacheTimeKey);
    return { items: JSON.parse(cached) as FeedItem[], stale: true, fetchedAt };
  }

  return { items: [] };
}
