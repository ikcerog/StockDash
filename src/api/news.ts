import { Hono } from "hono";
import type { Env } from "../types";

export const newsRoutes = new Hono<{ Bindings: Env }>();

interface NewsItem {
  title: string;
  source: string | null;
  link: string;
  pubDate: string | null;
}

const NEWS_QUERY =
  '(mortgage OR "Rocket Companies" OR "UWM Holdings" OR "United Wholesale Mortgage" OR "mortgage rates") when:3d';

// Google News RSS titles are formatted "Headline - Source"; split off the
// trailing source name rather than showing it duplicated in the headline.
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

// No API key needed; Google News RSS is public. Not cached — this app's
// traffic is low enough that fetching per request is fine.
newsRoutes.get("/", async (c) => {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(NEWS_QUERY)}&hl=en-US&gl=US&ceid=US:en`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      },
    });
    if (!res.ok) {
      return c.json({ error: `News feed request failed: ${res.status}` }, 502);
    }
    const xml = await res.text();
    return c.json({ items: parseRssItems(xml, 5) });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "News feed request failed" }, 502);
  }
});
