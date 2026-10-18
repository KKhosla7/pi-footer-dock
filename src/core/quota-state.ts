import type { RateLimitWindow } from './rate-limits.js';

import { QUOTA_INTERVAL_MS, QUOTA_MAX_AGE_MS } from './quota-limits.ts';
export { QUOTA_INTERVAL_MS, QUOTA_MAX_AGE_MS, QUOTA_MAX_WINDOWS } from './quota-limits.ts';
export const QUOTA_FAILURES = [
  'none',
  'loading',
  'network-or-timeout',
  'invalid-response',
  'authentication-failed',
  'http-error',
  'storage-unavailable',
  'abandoned-quarantine',
  'boot-quarantine',
  'initial-quarantine',
] as const;
export type QuotaFailure = (typeof QUOTA_FAILURES)[number];

export interface AccountObservation {
  windows: RateLimitWindow[];
  observedAt: number;
  observedMono: number;
}
export interface Reservation {
  revision: string;
  deadline: number;
}
export interface AcquisitionResult {
  observation: AccountObservation | null;
  failure: QuotaFailure;
  httpStatus: number | null;
  delay: number;
  clear?: boolean;
}
interface SharedQuotaMetadata {
  failure: QuotaFailure;
  httpStatus: number | null;
  attempts: number;
  lastAttemptAt: number | null;
  lastSuccessAt: number | null;
  nextAttemptInMs: number;
  /** Set only on a view the client synthesised itself because the worker stayed silent. */
  local?: 'watchdog';
}
export type SharedQuotaView = SharedQuotaMetadata &
  (
    | { kind: 'fresh' | 'stale'; observation: AccountObservation; ageMs: number }
    | { kind: 'unavailable' | 'loading'; observation: null; ageMs: number | null }
  );
export function quotaView(
  metadata: SharedQuotaMetadata,
  observation: AccountObservation | null,
  ageMs: number | null,
): SharedQuotaView {
  if (observation && ageMs !== null && ageMs <= QUOTA_MAX_AGE_MS)
    return {
      ...metadata,
      kind: metadata.failure === 'none' || metadata.failure === 'loading' ? 'fresh' : 'stale',
      observation,
      ageMs,
    };
  return {
    ...metadata,
    kind:
      metadata.failure === 'loading' || metadata.failure === 'initial-quarantine'
        ? 'loading'
        : 'unavailable',
    observation: null,
    ageMs,
  };
}
export interface QuotaCredential {
  identityKey: string;
  headers: Record<string, string>;
}
export interface QuotaWorkerRequest {
  id: number;
  command: 'sync' | 'close';
  headers?: Record<string, string>;
  deadlineMono?: number;
}
export interface QuotaWorkerReply {
  id: number;
  view: SharedQuotaView;
}

/** The refresh outlived its budget: a slow or unreachable server, not a storage fault. */
export function slowQuota(): SharedQuotaView {
  return {
    kind: 'unavailable',
    observation: null,
    ageMs: null,
    failure: 'network-or-timeout',
    httpStatus: null,
    attempts: 0,
    lastAttemptAt: null,
    lastSuccessAt: null,
    nextAttemptInMs: QUOTA_INTERVAL_MS,
    local: 'watchdog',
  };
}

export function unavailableQuota(): SharedQuotaView {
  return {
    kind: 'unavailable',
    observation: null,
    ageMs: null,
    failure: 'storage-unavailable',
    httpStatus: null,
    attempts: 0,
    lastAttemptAt: null,
    lastSuccessAt: null,
    nextAttemptInMs: QUOTA_INTERVAL_MS,
  };
}
