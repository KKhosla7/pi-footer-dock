import type { Snapshot } from './model.js';

/**
 * The snapshot without the quota windows the user chose not to see (matched by label). If that
 * hides every window the quota has nothing to say, rather than claiming it is unavailable.
 */
export function withoutWindows(
  snapshot: Snapshot,
  hidden: readonly string[] | undefined,
): Snapshot {
  const windows = snapshot.rateLimits?.windows;
  if (!hidden?.length || !windows || !snapshot.rateLimits) return snapshot;
  const kept = windows.filter((window) => !hidden.includes(window.label));
  const rateLimits = { ...snapshot.rateLimits, windows: kept };
  return kept.length === 0
    ? { ...snapshot, rateLimits, quotaStatus: '' }
    : { ...snapshot, rateLimits };
}
