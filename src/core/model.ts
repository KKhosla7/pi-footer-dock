import type { RateLimits } from './rate-limits.js';
import { costLabel, type ApiCostEstimate } from './api-cost.js';
import type { ResponseTiming, Unmeasured } from './response-speed.js';
import type { CacheUsage, CachePolicy } from './cache-usage.js';
import type { HistoryCosts } from './history/cost-types.js';
import type { HistoryRow } from './history/rows.js';

export interface GitState {
  branch: string | null;
  changed: number | null;
  ahead: number | null;
  /** Incomplete observation/watch coverage is unavailable, never a clean zero. */
  monitoring?: 'unavailable' | 'events';
}

export interface TokenTotals {
  input: number | null;
  output: number | null;
  cacheRead: number | null;
  cacheWrite: number | null;
  cost: number | null;
}

export interface Snapshot {
  cwd: string;
  home: string;
  git: GitState;
  tokens: number | null;
  capacity: number | null;
  percent: number | null;
  compactRemaining: number | null;
  /** Where Pi compacts, as a whole percent of the context window (rounded down); null without a window. */
  compactAt?: number | null;
  /** Pi's compaction reserve for this model, in tokens (`compaction.reserveTokens` or its default). */
  compactReserve?: number;
  autoCompact: boolean;
  totals: TokenTotals;
  provider: string;
  model: string;
  /** Pi's API id for the model (`anthropic-messages`, `openai-completions`, ...), when known. */
  api?: string;
  thinking: string | null;
  rateLimits: RateLimits | null;
  /** SDK-timed reported output throughput, not decoding or a live token estimate. */
  outputTokensPerSecond?: number | null;
  responseTiming?: ResponseTiming | null;
  /** Why the last finished response has no tokens-per-second figure; null when it has one. */
  speedUnmeasured?: Unmeasured | null;
  cacheUsage?: CacheUsage | null;
  /** How long Pi was idle before the response the cache sample is from; null when not known. */
  cacheIdleMs?: number | null;
  cachePolicy?: CachePolicy;
  quotaStatus?: string | null;
  quotaFreshness?: { ageMs: number; receivedMono: number; observedAt: number };
  apiCostEstimate?: ApiCostEstimate;
  /** Cost across sessions by day, week and month; absent when the history cannot be read. */
  historyCosts?: HistoryCosts;
  /** The rollup behind it, for the Explain screens: rows and project names, shared not copied. */
  history?: { rows: readonly HistoryRow[]; projects: Readonly<Record<string, string>> };
}

export function formatApiCost(estimate: ApiCostEstimate | undefined): string {
  return costLabel(estimate);
}

export function formatPercent(value: number | null): string {
  if (value === null) return '—';
  if (value === 0) return '0%';
  if (value < 0.1) return '<0.1%';
  if (value < 1) return `${value.toFixed(1)}%`;
  return `${Math.round(value)}%`;
}

const decimalFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

export function formatDecimal(value: number): string {
  return decimalFormatter.format(value);
}

export function formatTokens(
  value: number | null,
  precision: 'footer' | 'decimal' = 'footer',
): string {
  if (value === null) return '—';
  const divisor = value >= 1_000_000 ? 1_000_000 : value >= 1_000 ? 1_000 : 1;
  const suffix = divisor === 1_000_000 ? 'M' : divisor === 1_000 ? 'k' : '';
  const scaled = value / divisor;
  if (precision === 'decimal') return formatDecimal(scaled) + suffix;
  return (
    (divisor === 1_000_000 && value < 100_000_000
      ? scaled.toFixed(1)
      : String(Math.round(scaled))) + suffix
  );
}

/** Strip terminal controls from filesystem, git and model labels. */
export function safeLabel(value: string): string {
  return value.replace(/[\p{Cc}\p{Cf}]/gu, '');
}
