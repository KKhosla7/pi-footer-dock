import type { RateLimitWindow } from './rate-limits.js';

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const FIXED: Record<string, number> = { '5h': 5 * HOUR, week: 7 * DAY, month: 30 * DAY };
/** How far apart use and the clock may be, in points of the window, before it counts as ahead or behind. */
export const PACE_BAND = 5;
/** Before this share of the window has passed there is too little to compare. */
const TOO_EARLY = 0.02;
/** A projection needs this much of the window behind it to mean anything. */
const PROJECT_FROM = 0.1;

export type Verdict =
  'blocked' | 'out' | 'reset-due' | 'just-started' | 'ahead' | 'behind' | 'on-pace' | 'unknown';

export interface Pace {
  verdict: Verdict;
  /** Percent of the window used. */
  used: number;
  /** How far through the window the clock is, 0..1; null when it cannot be told. */
  elapsed: number | null;
  /** Use minus clock, in percentage points: positive means use is ahead of the clock. */
  delta: number | null;
  /** Straight-line guess of the share used at the reset; null when too early to guess. */
  projectedAtReset: number | null;
  /** How long before the reset the window would run out at this rate; null when it would not. */
  runsOutBeforeResetMs: number | null;
  /** The window length is assumed, not reported (the month). */
  approximate: boolean;
}

/** Length of a window from its label: `5h`, `week`, `month`, or forms like `3d`, `90m`. */
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

/** The straight-line guess at the reset, and when the window would run dry if that guess holds. */
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

/**
 * Whether use is ahead of or behind the clock for one window. A straight line from the start of
 * the window to now is the only model: it is a comparison, not a forecast, and says so in the UI.
 */
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
