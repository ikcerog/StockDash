export interface Quote {
  symbol: string;
  price: number;
  previousClose: number;
  changePercent: number;
  currency: string | null;
  name: string | null;
  marketTime: number | null;
}

interface YahooChartResponse {
  chart: {
    result: Array<{
      meta: {
        symbol?: string;
        regularMarketPrice?: number;
        previousClose?: number;
        chartPreviousClose?: number;
        currency?: string;
        longName?: string;
        shortName?: string;
        regularMarketTime?: number;
      };
    }> | null;
    error: unknown;
  };
}

// Yahoo's unofficial chart endpoint; no API key required, but it does want a
// browser-like User-Agent or it returns 429s.
export async function fetchQuote(symbol: string): Promise<Quote | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "application/json",
    },
  });
  if (!res.ok) return null;

  const data = (await res.json()) as YahooChartResponse;
  const result = data.chart.result?.[0];
  if (!result) return null;

  const meta = result.meta;
  const price = meta.regularMarketPrice;
  const previousClose = meta.previousClose ?? meta.chartPreviousClose;
  if (typeof price !== "number" || typeof previousClose !== "number" || previousClose === 0) {
    return null;
  }

  return {
    symbol: meta.symbol ?? symbol,
    price,
    previousClose,
    changePercent: ((price - previousClose) / previousClose) * 100,
    currency: meta.currency ?? null,
    name: meta.longName ?? meta.shortName ?? null,
    marketTime: meta.regularMarketTime ?? null,
  };
}

export interface HistoryPoint {
  date: string;
  close: number;
}

const VALID_HISTORY_RANGES = new Set(["1mo", "3mo", "6mo", "1y", "5y"]);

interface YahooHistoryResponse {
  chart: {
    result: Array<{
      timestamp?: number[];
      indicators: { quote: Array<{ close?: Array<number | null> }> };
    }> | null;
    error: unknown;
  };
}

export async function fetchHistory(symbol: string, range: string): Promise<HistoryPoint[]> {
  const safeRange = VALID_HISTORY_RANGES.has(range) ? range : "6mo";
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${safeRange}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      Accept: "application/json",
    },
  });
  if (!res.ok) return [];

  const data = (await res.json()) as YahooHistoryResponse;
  const result = data.chart.result?.[0];
  if (!result?.timestamp) return [];

  const closes = result.indicators.quote[0]?.close ?? [];
  const points: HistoryPoint[] = [];
  result.timestamp.forEach((ts, i) => {
    const close = closes[i];
    if (typeof close === "number") {
      points.push({ date: new Date(ts * 1000).toISOString().slice(0, 10), close });
    }
  });
  return points;
}

export async function fetchQuotes(symbols: string[]): Promise<Map<string, Quote>> {
  const map = new Map<string, Quote>();
  const settled = await Promise.all(
    symbols.map(async (symbol) => {
      try {
        return [symbol, await fetchQuote(symbol)] as const;
      } catch {
        return [symbol, null] as const;
      }
    }),
  );
  for (const [symbol, quote] of settled) {
    if (quote) map.set(symbol, quote);
  }
  return map;
}
