// Implicit percent-change thresholds every watchlist entry is evaluated
// against in addition to whatever the user configured on the row. Applied
// in the scheduled check (src/scheduled.ts) and exposed to the UI via
// /api/alerts/defaults so it can list them alongside user thresholds.
//
// These are per-user in effect — the cron only alerts the row's owner —
// but not editable per user, so every signed-in user automatically gets
// them for every stock they track without having to configure anything.
export const DEFAULT_PERCENT_THRESHOLDS = [6.5, 10] as const;

// item.percent_change_threshold is a normalized comma-separated list, e.g. "1,3,5,10".
// Merges the user's list with DEFAULT_PERCENT_THRESHOLDS, dedupes, sorts ascending.
export function resolvePercentThresholds(raw: string | null): number[] {
  const userThresholds = raw
    ? raw
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n))
    : [];
  return [...new Set([...userThresholds, ...DEFAULT_PERCENT_THRESHOLDS])].sort((a, b) => a - b);
}
