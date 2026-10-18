import { presentAccountQuota } from '../core/quota-presentation.js';
import type { QuotaState } from '../core/quota-presentation.js';
import { quotaView } from '../core/quota-state.js';
import type { SharedQuotaView } from '../core/quota-state.js';
import type { GateState } from './gate-state.js';

/** The shared gate file as the same view type the Codex source uses, so age and staleness agree. */
export function gateView(state: GateState, now: number): SharedQuotaView {
  const observation = state.observation && { ...state.observation, observedMono: 0 };
  return quotaView(
    {
      failure: state.failure,
      httpStatus: state.httpStatus,
      attempts: state.attempts,
      lastAttemptAt: state.lastAttemptAt,
      lastSuccessAt: state.lastSuccessAt,
      nextAttemptInMs: Math.max(0, state.nextEligibleAt - now),
    },
    observation,
    observation ? Math.max(0, now - observation.observedAt) : null,
  );
}

export function presentGate(
  view: SharedQuotaView,
  model: { provider: string; id: string },
): QuotaState {
  const shown = presentAccountQuota(view, { provider: model.provider, model: model.id });
  return !view.observation && view.failure === 'authentication-failed'
    ? { ...shown, status: 'quota auth rejected' }
    : shown;
}

/** Counters and timestamps only; never a credential, scope or response text. */
export function viewDiagnostics(view: SharedQuotaView | undefined) {
  return {
    httpStatus: view?.httpStatus ?? null,
    lastAttemptAt: view?.lastAttemptAt ?? null,
    lastSuccessAt: view?.lastSuccessAt ?? null,
    ageMs: view?.ageMs ?? null,
    nextAttemptInMs: view?.nextAttemptInMs ?? null,
  };
}
