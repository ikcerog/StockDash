// Implicit percent-change thresholds evaluated against DEFAULT_ALERT_SYMBOLS
// in addition to whatever the user configured on the row. Applied in the
// scheduled check (src/scheduled.ts) and exposed to the UI via
// /api/alerts/defaults so it can list them alongside user thresholds.
//
// These are per-user in effect — the cron only alerts the row's owner —
// but not editable per user: every signed-in user automatically gets them
// on any DEFAULT_ALERT_SYMBOLS they track. User-set percent thresholds
// on other stocks are unaffected.
export const DEFAULT_PERCENT_THRESHOLDS = [6.5, 10] as const;
export const DEFAULT_ALERT_SYMBOLS = ["RKT"] as const;

const DEFAULT_ALERT_SYMBOL_SET: ReadonlySet<string> = new Set(DEFAULT_ALERT_SYMBOLS);

// item.percent_change_threshold is a normalized comma-separated list, e.g. "1,3,5,10".
// Merges the user's list with DEFAULT_PERCENT_THRESHOLDS (only for symbols in
// DEFAULT_ALERT_SYMBOLS), dedupes, sorts ascending.
export function resolvePercentThresholds(symbol: string, raw: string | null): number[] {
  const userThresholds = raw
    ? raw
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n))
    : [];
  const defaults = DEFAULT_ALERT_SYMBOL_SET.has(symbol) ? DEFAULT_PERCENT_THRESHOLDS : [];
  return [...new Set([...userThresholds, ...defaults])].sort((a, b) => a - b);
}
