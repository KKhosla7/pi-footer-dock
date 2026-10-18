import type { RateLimits } from './rate-limits.js';
import type { SharedQuotaView } from './quota-state.js';

export interface QuotaState {
  limits: RateLimits | null;
  status: string | null;
  freshness?: { ageMs: number; receivedMono: number; observedAt: number };
}
function status(view: SharedQuotaView): string | null {
  switch (view.kind) {
    case 'fresh':
      return null;
    case 'stale':
      return 'quota stale';
    case 'loading':
      return view.failure === 'initial-quarantine' ? 'quota cooling down' : 'quota loading';
    case 'unavailable':
      if (view.failure === 'authentication-failed') return 'Codex auth unavailable';
      return view.failure === 'network-or-timeout'
        ? 'quota refresh slow or offline'
        : 'quota unavailable';
  }
}
/** Model labels are presentation only; they do not enter account admission/cache identity. */
export function presentAccountQuota(
  view: SharedQuotaView,
  model: Pick<RateLimits, 'provider' | 'model'>,
  receivedMono = performance.now(),
): QuotaState {
  if (!view.observation) return { limits: null, status: status(view) };
  return {
    limits: { ...model, windows: view.observation.windows },
    status: status(view),
    freshness: { ageMs: view.ageMs, receivedMono, observedAt: view.observation.observedAt },
  };
}
