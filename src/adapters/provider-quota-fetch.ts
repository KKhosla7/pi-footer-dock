import type { ProviderQuotaSource } from '../quota-sources/contract.js';
import { PROVIDER_QUOTA_FETCH_MS, PROVIDER_QUOTA_MAX_BACKOFF_MS } from '../core/quota-limits.js';
import { authorizedGet } from './authorized-fetch.js';
import type { Credential, EndpointReply } from './authorized-fetch.js';
import type { GateResult, GateState } from './gate-state.js';

export interface FetchPolicy {
  intervalMs: number;
  now: () => number;
  fetch?: typeof fetch;
}
const MAX_RETRY_AFTER_MS = 3_600_000;

/** Doubling backoff while failures repeat, never below the interval, honouring Retry-After. */
export function backoff(
  policy: FetchPolicy,
  previous: GateState | undefined,
  retryAfterMs: number | null,
): number {
  const failing = previous && previous.failure !== 'none' && previous.failure !== 'loading';
  const doubled = failing ? previous.delayMs * 2 : policy.intervalMs;
  const bounded = Math.min(Math.max(policy.intervalMs, doubled), PROVIDER_QUOTA_MAX_BACKOFF_MS);
  return Math.ceil(Math.max(bounded, Math.min(retryAfterMs ?? 0, MAX_RETRY_AFTER_MS)));
}

/** Turns one reply into a gate result: strict parse on success, typed failure otherwise. */
export function classify(
  policy: FetchPolicy,
  reply: EndpointReply,
  call: { source: ProviderQuotaSource; previous: GateState | undefined },
): GateResult {
  const delayMs = backoff(policy, call.previous, reply.retryAfterMs);
  if (reply.status >= 200 && reply.status < 300) {
    const windows = call.source.parse(reply.body);
    return windows
      ? {
          observation: { windows, observedAt: policy.now() },
          failure: 'none',
          httpStatus: reply.status,
          delayMs: policy.intervalMs,
        }
      : { observation: null, failure: 'invalid-response', httpStatus: reply.status, delayMs };
  }
  const rejected = reply.status === 401 || reply.status === 403;
  return {
    observation: null,
    failure: rejected ? 'authentication-failed' : 'http-error',
    httpStatus: reply.status,
    delayMs,
    ...(rejected ? { clear: true } : {}),
  };
}

/** One bounded request. Never throws: any transport problem is a `network-or-timeout` result. */
export async function fetchResult(
  policy: FetchPolicy,
  call: { source: ProviderQuotaSource; credential: Credential; previous: GateState | undefined },
): Promise<GateResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, PROVIDER_QUOTA_FETCH_MS);
  try {
    const reply = await authorizedGet(
      { origin: call.source.origin, path: call.source.path },
      call.credential,
      {
        signal: controller.signal,
        now: policy.now,
        ...(policy.fetch ? { fetch: policy.fetch } : {}),
      },
    );
    return classify(policy, reply, call);
  } catch {
    const delayMs = backoff(policy, call.previous, null);
    return { observation: null, failure: 'network-or-timeout', httpStatus: null, delayMs };
  } finally {
    clearTimeout(timer);
  }
}
