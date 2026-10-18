import type { RateLimits, RateLimitWindow } from './rate-limits.js';

/** OpenAI's documented API rate-limit headers; not ChatGPT subscription windows. */
function resetDelay(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const units = new Map([
    ['ms', 0.001],
    ['s', 1],
    ['m', 60],
    ['h', 3600],
    ['d', 86400],
  ]);
  const parts = [...value.matchAll(/(\d+(?:\.\d+)?)(ms|s|m|h|d)/gu)];
  if (parts.map((part) => part[0]).join('') !== value) return undefined;
  const seconds = parts.reduce(
    (total, part) => total + Number(part[1]) * (units.get(part[2] ?? '') ?? 0),
    0,
  );
  return Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}
function window(
  headers: ReadonlyMap<string, string>,
  unit: string,
  now: number,
): RateLimitWindow | undefined {
  const limitText = headers.get(`x-ratelimit-limit-${unit}`);
  const remainingText = headers.get(`x-ratelimit-remaining-${unit}`);
  if (!limitText?.trim() || !remainingText?.trim()) return undefined;
  const limit = Number(limitText);
  const remaining = Number(remainingText);
  const delay = resetDelay(headers.get(`x-ratelimit-reset-${unit}`));
  if (
    !Number.isFinite(limit) ||
    !Number.isFinite(remaining) ||
    limit <= 0 ||
    remaining < 0 ||
    remaining > limit ||
    delay === undefined
  )
    return undefined;
  return {
    label: `API ${unit}`,
    remainingPercent: (remaining / limit) * 100,
    resetAt: now / 1000 + delay,
  };
}
export function parseOpenAIRateHeaders(
  model: string,
  headers: Record<string, string>,
  now = Date.now(),
): RateLimits | undefined {
  const normalized = new Map(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  const windows = ['tokens', 'requests']
    .map((unit) => window(normalized, unit, now))
    .filter((item): item is RateLimitWindow => item !== undefined);
  return windows.length ? { provider: 'openai', model, windows } : undefined;
}
