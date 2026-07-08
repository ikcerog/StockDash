export interface Rate {
  seriesId: string;
  label: string;
  value: number;
  previous: number | null;
  date: string;
}

export const RATE_SERIES = [
  { seriesId: "DGS10", label: "10Y Treasury" },
  { seriesId: "MORTGAGE15US", label: "15Y Mortgage" },
  { seriesId: "MORTGAGE30US", label: "30Y Mortgage" },
] as const;

interface FredObservationsResponse {
  observations?: Array<{ date: string; value: string }>;
  error_code?: number;
  error_message?: string;
}

export async function fetchRate(
  seriesId: string,
  label: string,
  apiKey: string,
): Promise<Rate | null> {
  const url = new URL("https://api.stlouisfed.org/fred/series/observations");
  url.searchParams.set("series_id", seriesId);
  url.searchParams.set("api_key", apiKey);
  url.searchParams.set("file_type", "json");
  url.searchParams.set("sort_order", "desc");
  // Daily series (DGS10) skip weekends/holidays and report "." for missing
  // days, so fetch a buffer of observations to find the two latest real values.
  url.searchParams.set("limit", "10");

  const res = await fetch(url);
  const data = (await res.json().catch(() => ({}))) as FredObservationsResponse;

  if (!res.ok || data.error_message) {
    throw new Error(data.error_message ?? `FRED request failed: ${res.status}`);
  }

  const numeric = (data.observations ?? [])
    .filter((obs) => obs.value !== ".")
    .map((obs) => ({ date: obs.date, value: Number(obs.value) }))
    .filter((obs) => !Number.isNaN(obs.value));

  const latest = numeric[0];
  if (!latest) return null;

  return {
    seriesId,
    label,
    value: latest.value,
    previous: numeric[1]?.value ?? null,
    date: latest.date,
  };
}

export async function fetchRates(apiKey: string): Promise<Rate[]> {
  const results = await Promise.all(
    RATE_SERIES.map((series) => fetchRate(series.seriesId, series.label, apiKey)),
  );
  return results.filter((rate): rate is Rate => rate !== null);
}
