import type { CacheKind } from './cache-class.js';
import type { CacheUsage } from './cache-usage.js';
import { formatTokens } from './model.js';

export function formatCacheReuse(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || value > 100) return '—';
  if (value < 0.1) return '<0.1%';
  if (value === 100) return '100%';
  const rounded = Number(value.toFixed(1));
  return rounded >= 100 ? '<100%' : `${rounded}%`;
}

function reuseParts(cache: CacheUsage, short: boolean, kind: CacheKind): string[] {
  if (kind === 'unreported') return ['not reported'];
  if (cache.read === 0) return ['0%'];
  const share = formatCacheReuse(cache.reusePercent);
  const known = share !== '—';
  return [
    ...(known ? [share] : []),
    ...(short && known ? [] : [`${formatTokens(cache.read)} read`]),
  ];
}
export function formatCacheSummary(
  cache: CacheUsage | null | undefined,
  short = false,
  kind: CacheKind = cache ? 'reported' : 'pending',
): string {
  if (!cache) return 'cache pending';
  const written =
    !short && cache.write !== null && cache.write > 0
      ? [`${formatTokens(cache.write)} written`]
      : [];
  const parts = [...(cache.read === null ? [] : reuseParts(cache, short, kind)), ...written];
  return `last ${parts.join(' · ') || 'cache unavailable'}`;
}
