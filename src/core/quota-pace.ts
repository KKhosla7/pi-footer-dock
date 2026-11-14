import type { RateLimitWindow } from './rate-limits.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const FIXED: Record<string, number> = { '5h': 5 * HOUR, week: 7 * DAY, month: 30 * DAY };
export const PACE_BAND = 5;
const TOO_EARLY = 0.02;
const PROJECT_FROM = 0.1;

export type Verdict =
  'blocked' | 'out' | 'reset-due' | 'just-started' | 'ahead' | 'behind' | 'on-pace' | 'unknown';

export interface Pace {
  verdict: Verdict;
  used: number;
  elapsed: number | null;
  delta: number | null;
  projectedAtReset: number | null;
  runsOutBeforeResetMs: number | null;
  approximate: boolean;
}

export function windowLength(label: string): { ms: number; approximate: boolean } | undefined {
  const fixed = FIXED[label];
  if (fixed !== undefined) return { ms: fixed, approximate: label === 'month' };
  const match = /^(\d{1,4})([mhd])$/u.exec(label);
  if (!match) return undefined;
  const unit = { m: 60_000, h: HOUR, d: DAY }[match[2] as 'm' | 'h' | 'd'];
  return { ms: Number(match[1]) * unit, approximate: false };
}

function base(used: number, verdict: Verdict, approximate = false): Pace {
  return {
    verdict,
    used,
    elapsed: null,
    delta: null,
    projectedAtReset: null,
    runsOutBeforeResetMs: null,
    approximate,
  };
}

function verdictFor(delta: number): Verdict {
  if (delta > PACE_BAND) return 'ahead';
  return delta < -PACE_BAND ? 'behind' : 'on-pace';
}

function projection(
  used: number,
  elapsed: number,
  toReset: number,
  length: number,
): Pick<Pace, 'projectedAtReset' | 'runsOutBeforeResetMs'> {
  if (elapsed < PROJECT_FROM || used <= 0)
    return { projectedAtReset: null, runsOutBeforeResetMs: null };
  const projectedAtReset = used / elapsed;
  if (projectedAtReset <= 100) return { projectedAtReset, runsOutBeforeResetMs: null };
  const runsOutIn = ((100 - used) * elapsed * length) / used;
  const before = toReset - runsOutIn;
  return { projectedAtReset, runsOutBeforeResetMs: before > 0 ? before : null };
}

export function paceOf(window: RateLimitWindow, nowMs: number): Pace {
  const used = 100 - window.remainingPercent;
  if (window.badge !== undefined) return base(used, 'blocked');
  if (window.remainingPercent <= 0) return base(used, 'out');
  const length = windowLength(window.label);
  if (!length) return base(used, 'unknown');
  const toReset = window.resetAt * 1000 - nowMs;
  if (toReset <= 0) return base(used, 'reset-due', length.approximate);
  const elapsed = Math.max(0, Math.min(1, 1 - toReset / length.ms));
  if (elapsed < TOO_EARLY) return { ...base(used, 'just-started', length.approximate), elapsed };
  const delta = used - elapsed * 100;
  return {
    ...base(used, verdictFor(delta), length.approximate),
    elapsed,
    delta,
    ...projection(used, elapsed, toReset, length.ms),
  };
}
