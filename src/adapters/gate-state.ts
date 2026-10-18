import { QUOTA_MAX_WINDOWS } from '../core/quota-limits.js';
import { QUOTA_FAILURES } from '../core/quota-state.js';
import type { QuotaFailure } from '../core/quota-state.js';
import type { RateLimitWindow } from '../core/rate-limits.js';

export interface GateObservation {
  windows: RateLimitWindow[];
  observedAt: number;
}
export interface GateState {
  revision: string;
  nextEligibleAt: number;
  inFlightUntil: number;
  delayMs: number;
  attempts: number;
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
  failure: QuotaFailure;
  httpStatus: number | null;
  observation: GateObservation | null;
}
export interface GateResult {
  observation: GateObservation | null;
  failure: QuotaFailure;
  httpStatus: number | null;
  delayMs: number;
  /** Drop the stored observation, for example after the provider rejected the credential. */
  clear?: boolean;
}

type RecordLike = Record<string, unknown>;
const badgePattern = /^[a-z][a-z-]{0,23}$/u;

function record(value: unknown): RecordLike | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as RecordLike)
    : undefined;
}
function num(value: unknown, minimum = 0): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum;
}
function nullable(value: unknown): number | null | undefined {
  return value === null ? null : num(value) ? value : undefined;
}
function parseWindow(item: unknown): RateLimitWindow | undefined {
  const entry = record(item);
  if (typeof entry?.label !== 'string' || !/^[\w .-]{1,24}$/u.test(entry.label)) return undefined;
  if (!num(entry.remainingPercent) || entry.remainingPercent > 100 || !num(entry.resetAt, 1))
    return undefined;
  const base = {
    label: entry.label,
    remainingPercent: entry.remainingPercent,
    resetAt: entry.resetAt,
  };
  const badge = entry.badge;
  if (badge === undefined) return base;
  return typeof badge === 'string' && badgePattern.test(badge) ? { ...base, badge } : undefined;
}
function parseWindows(value: unknown): RateLimitWindow[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > QUOTA_MAX_WINDOWS)
    return undefined;
  const windows = value.map(parseWindow);
  return windows.every((window) => window !== undefined) ? windows : undefined;
}
function parseObservation(value: unknown): GateObservation | null | undefined {
  if (value === null) return null;
  const entry = record(value);
  const windows = parseWindows(entry?.windows);
  return windows && num(entry?.observedAt) ? { windows, observedAt: entry.observedAt } : undefined;
}
function timing(data: RecordLike | undefined) {
  return num(data?.nextEligibleAt) &&
    num(data.inFlightUntil) &&
    num(data.delayMs) &&
    num(data.attempts)
    ? {
        nextEligibleAt: data.nextEligibleAt,
        inFlightUntil: data.inFlightUntil,
        delayMs: data.delayMs,
        attempts: data.attempts,
      }
    : undefined;
}
function outcome(data: RecordLike | undefined) {
  const observation = parseObservation(data?.observation);
  const lastAttemptAt = nullable(data?.lastAttemptAt);
  const lastSuccessAt = nullable(data?.lastSuccessAt);
  const httpStatus = nullable(data?.httpStatus);
  const failure = QUOTA_FAILURES.find((name) => name === data?.failure);
  return observation !== undefined &&
    lastAttemptAt !== undefined &&
    lastSuccessAt !== undefined &&
    httpStatus !== undefined &&
    failure !== undefined
    ? { observation, lastAttemptAt, lastSuccessAt, httpStatus, failure }
    : undefined;
}
/** Strict parse of one gate file; anything unexpected is treated as no state. */
export function parseGateState(text: string): GateState | undefined {
  let data: RecordLike | undefined;
  try {
    data = record(JSON.parse(text));
  } catch {
    return undefined;
  }
  const times = timing(data);
  const rest = outcome(data);
  return typeof data?.revision === 'string' && times && rest
    ? { revision: data.revision, ...times, ...rest }
    : undefined;
}

const MAX_GATE_MS = 3_600_000;
const CLOCK_SKEW_MS = 5000;
/**
 * Whether a caller may start a new request now. Stored times are bounded relative to when the
 * state was written, and state written "in the future" (the clock moved back) never blocks.
 */
export function admits(state: GateState | undefined, now: number, flightMs: number): boolean {
  if (!state) return true;
  const written = state.lastAttemptAt ?? 0;
  if (written > now + CLOCK_SKEW_MS) return true;
  const next = Math.min(state.nextEligibleAt, written + MAX_GATE_MS + 60_000);
  const flight = Math.min(state.inFlightUntil, written + flightMs);
  return now >= next && now >= flight;
}
export function reservedState(
  state: GateState | undefined,
  now: number,
  plan: { revision: string; minIntervalMs: number; flightMs: number },
): GateState {
  const prior: GateState = state ?? {
    revision: '',
    nextEligibleAt: 0,
    inFlightUntil: 0,
    delayMs: plan.minIntervalMs,
    attempts: 0,
    lastAttemptAt: null,
    lastSuccessAt: null,
    failure: 'loading',
    httpStatus: null,
    observation: null,
  };
  return {
    ...prior,
    revision: plan.revision,
    nextEligibleAt: now + plan.minIntervalMs,
    inFlightUntil: now + plan.flightMs,
    attempts: prior.attempts + 1,
    lastAttemptAt: now,
    failure: prior.observation ? prior.failure : 'loading',
  };
}
export function finishedState(state: GateState, now: number, result: GateResult): GateState {
  return {
    ...state,
    inFlightUntil: 0,
    nextEligibleAt: now + result.delayMs,
    delayMs: result.delayMs,
    failure: result.failure,
    httpStatus: result.httpStatus,
    lastSuccessAt: result.observation ? now : state.lastSuccessAt,
    observation: result.clear ? null : (result.observation ?? state.observation),
  };
}
