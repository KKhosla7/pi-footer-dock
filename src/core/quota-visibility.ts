import type { Snapshot } from './model.js';

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
