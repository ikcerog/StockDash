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

// Fetches every source concurrently (rather than stopping at the first
// that succeeds) and interleaves their items round-robin so one outlet
// can't dominate the result just because another source -- most often
// Google News, whose RSS endpoint intermittently rate-limits/blocks cloud
// egress IPs, a real observed failure mode -- happened to fail or come back
// empty. Falls back to the last cached merged result if every source fails,
// rather than returning nothing.
export async function fetchFeedWithFallback(
  db: D1Database,
  sources: FeedSource[],
  opts: { cacheKey: string; relevanceCheck: (item: FeedItem) => boolean; maxAgeDays: number; limit: number },
): Promise<FeedResult> {
  const cacheKey = `${opts.cacheKey}_ITEMS`;
  const cacheTimeKey = `${opts.cacheKey}_FETCHED_AT`;

  const perSource = await Promise.all(
    sources.map(async (source) => {
      try {
        const xml = await fetchFeedXml(source.url);
        let items = parseRssItems(xml, source.filterRelevant ? 20 : 10);
        if (source.filterRelevant) items = items.filter(opts.relevanceCheck);
        return items
          .filter((item) => isRecent(item, opts.maxAgeDays))
          .map((item) => ({ ...item, source: item.source ?? source.name }));
      } catch {
        return [];
      }
    }),
  );

  const merged: FeedItem[] = [];
  const seenLinks = new Set<string>();
  for (let round = 0; merged.length < opts.limit && perSource.some((list) => round < list.length); round++) {
    for (const list of perSource) {
      if (round >= list.length) continue;
      const item = list[round];
      if (seenLinks.has(item.link)) continue; // Google News and a publisher's own feed can surface the same story
      seenLinks.add(item.link);
      merged.push(item);
      if (merged.length >= opts.limit) break;
    }
  }

  if (merged.length > 0) {
    await setSetting(db, cacheKey, JSON.stringify(merged));
    await setSetting(db, cacheTimeKey, new Date().toISOString());
    return { items: merged, source: sources.map((s) => s.name).join(", ") };
  }

  const cached = await getSetting(db, cacheKey);
  if (cached) {
    const fetchedAt = await getSetting(db, cacheTimeKey);
    return { items: JSON.parse(cached) as FeedItem[], stale: true, fetchedAt };
  }

  return { items: [] };
}
