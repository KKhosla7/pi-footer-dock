import { QUOTA_MAX_WINDOWS } from './quota-limits.ts';

export interface RateLimitWindow {
  label: string;
  remainingPercent: number;
  resetAt: number;
  /** A provider-published blocking status, such as `rate-limited`. Absent when the window is fine. */
  badge?: string;
}

export interface RateLimits {
  provider: string;
  model: string;
  windows: RateLimitWindow[];
}

type RecordLike = Record<string, unknown>;

function record(value: unknown): RecordLike | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordLike)
    : undefined;
}

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function windowLabel(minutes: number): string {
  if (minutes === 10_080) return 'week';
  if (minutes === 43_200 || minutes === 44_640) return 'month';
  if (minutes % 1_440 === 0) return `${minutes / 1_440}d`;
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  return `${minutes}m`;
}

function parseWindow(value: unknown): RateLimitWindow | undefined {
  const item = record(value);
  const usedPercent = finite(item?.used_percent);
  const minutes = finite(item?.window_minutes);
  const resetAt = finite(item?.reset_at);
  if (
    usedPercent === undefined ||
    minutes === undefined ||
    resetAt === undefined ||
    usedPercent < 0 ||
    usedPercent > 100 ||
    minutes <= 0 ||
    resetAt <= 0
  ) {
    return undefined;
  }
  return { label: windowLabel(minutes), remainingPercent: 100 - usedPercent, resetAt };
}

function parseWindowPair(value: RecordLike | undefined): RateLimitWindow[] {
  return [parseWindow(value?.primary), parseWindow(value?.secondary)].filter(
    (item): item is RateLimitWindow => item !== undefined,
  );
}

function appendUnique(target: RateLimitWindow[], candidates: RateLimitWindow[]): void {
  const keys = new Set(target.map((window) => `${window.label}/${window.resetAt}`));
  for (const window of candidates) {
    const key = `${window.label}/${window.resetAt}`;
    if (!keys.has(key) && target.length < QUOTA_MAX_WINDOWS) {
      keys.add(key);
      target.push(window);
    }
  }
}

function additionalWindows(value: unknown): RateLimitWindow[] {
  const item = record(value);
  return parseWindowPair(record(item?.rate_limits) ?? item);
}

/** Parse only the documented Codex stream event shape; unknown fields are ignored. */
export function parseRateLimits(
  provider: string,
  model: string,
  data: unknown,
): RateLimits | undefined {
  const event = record(data);
  if (event?.type !== 'codex.rate_limits') return undefined;
  const windows = parseWindowPair(record(event.rate_limits));
  const additional = Array.isArray(event.additional_rate_limits)
    ? event.additional_rate_limits.slice(0, QUOTA_MAX_WINDOWS).flatMap(additionalWindows)
    : [];
  appendUnique(windows, additional);
  return windows.length > 0 ? { provider, model, windows } : undefined;
}

/** ChatGPT account usage uses seconds, unlike Codex stream window_minutes. */
export function parseCodexUsage(
  provider: string,
  model: string,
  data: unknown,
): RateLimits | undefined {
  const limits = record(record(data)?.rate_limit);
  const windows = [limits?.primary_window, limits?.secondary_window]
    .map((candidate) => {
      const window = record(candidate);
      const seconds = finite(window?.limit_window_seconds);
      return parseWindow({
        used_percent: window?.used_percent,
        reset_at: window?.reset_at,
        window_minutes: seconds === undefined ? undefined : seconds / 60,
      });
    })
    .filter((window): window is RateLimitWindow => window !== undefined);
  return windows.length > 0 ? { provider, model, windows } : undefined;
}

function storedRemaining(window: RecordLike | undefined): number | undefined {
  const legacyUsedPercent = finite(window?.usedPercent);
  return (
    finite(window?.remainingPercent) ??
    (legacyUsedPercent === undefined ? undefined : 100 - legacyUsedPercent)
  );
}

function parseStoredWindow(candidate: unknown): RateLimitWindow | undefined {
  const window = record(candidate);
  const remainingPercent = storedRemaining(window);
  const resetAt = finite(window?.resetAt);
  if (
    typeof window?.label !== 'string' ||
    window.label.length > 64 ||
    /[\p{Cc}\p{Cf}]/u.test(window.label)
  )
    return undefined;
  if (remainingPercent === undefined || remainingPercent < 0 || remainingPercent > 100) {
    return undefined;
  }
  if (resetAt === undefined || resetAt <= 0) return undefined;
  return { label: window.label, remainingPercent, resetAt };
}

/** Validate quota state restored from a session custom entry. */
export function parseStoredRateLimits(data: unknown): RateLimits | undefined {
  const value = record(data);
  if (
    typeof value?.provider !== 'string' ||
    typeof value.model !== 'string' ||
    value.provider.length > 256 ||
    value.model.length > 256
  )
    return undefined;
  if (!Array.isArray(value.windows) || value.windows.length > QUOTA_MAX_WINDOWS) return undefined;
  const windows = value.windows
    .map(parseStoredWindow)
    .filter((window): window is RateLimitWindow => window !== undefined);
  return windows.length > 0 ? { provider: value.provider, model: value.model, windows } : undefined;
}

export function formatReset(resetAt: number, now = Date.now()): string {
  const totalMinutes = Math.max(0, Math.ceil((resetAt - now / 1000) / 60));
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}
