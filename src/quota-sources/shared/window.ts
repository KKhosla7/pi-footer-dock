import type { RateLimitWindow } from '../../core/rate-limits.js';

export type RecordLike = Record<string, unknown>;

export function record(value: unknown): RecordLike | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordLike)
    : undefined;
}
function usedPercent(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : undefined;
}
function resetSeconds(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.length === 0 || value.length > 40) return undefined;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds) && milliseconds > 0
    ? Math.floor(milliseconds / 1000)
    : undefined;
}
/** A window is shown only when the provider gave both a valid used share and a reset time. */
export function windowOf(
  label: string,
  used: unknown,
  reset: unknown,
): RateLimitWindow | undefined {
  const percent = usedPercent(used);
  const resetAt = resetSeconds(reset);
  return percent === undefined || resetAt === undefined
    ? undefined
    : { label, remainingPercent: 100 - percent, resetAt };
}
