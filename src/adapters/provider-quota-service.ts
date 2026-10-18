import { userInfo } from 'node:os';
import { join } from 'node:path';
import { QuotaProblem } from '../quota-sources/contract.js';
import { NAMES } from '../core/product.js';
import type { Problem, ProviderQuotaSource, QuotaContext } from '../quota-sources/contract.js';
import { quotaSourceFor } from '../quota-sources/registry.js';
import {
  PROVIDER_QUOTA_ACTIVE_MS,
  PROVIDER_QUOTA_FLIGHT_MS,
  PROVIDER_QUOTA_INTERVAL_MS,
} from '../core/quota-limits.js';
import type { QuotaState } from '../core/quota-presentation.js';
import type { SharedQuotaView } from '../core/quota-state.js';
import { fetchResult } from './provider-quota-fetch.js';
import { resolveCredential } from './quota-credentials.js';
import type { FetchPolicy } from './provider-quota-fetch.js';
import { gateView, presentGate, viewDiagnostics } from './provider-quota-view.js';
import { SharedGate } from './shared-gate.js';
import type { GateState } from './shared-gate.js';

export interface ProviderQuotaOptions {
  gate?: SharedGate;
  fetch?: typeof fetch;
  now?: () => number;
  intervalMs?: number;
}
const HINT_SPACING_MS = 2000;
type Trouble = Problem | 'unavailable';
const troubleStatus: Record<Trouble, string> = {
  unsupported: 'quota source unsupported',
  auth: 'quota auth unavailable',
  unavailable: 'quota unavailable',
};

export function defaultProviderRoot(): string {
  return join(userInfo().homedir, '.cache', NAMES.cacheDir, 'providers-v1');
}

/**
 * Process-local subscriber for server-published provider windows. Every request is admitted by
 * the shared gate, so any number of Pi windows make at most one request per interval per account.
 *
 * It stores only what it learned (the latest gate state for the active account, the last trouble)
 * and answers `state()` for the model in use right now. It never keeps a presented copy, so a
 * model change can never leave a stale or empty display behind.
 */
export class ProviderQuotaService {
  private readonly gate: SharedGate;
  private readonly policy: FetchPolicy;
  private ctx: QuotaContext | undefined;
  private source: ProviderQuotaSource | undefined;
  private scope: string | undefined;
  private gateState: GateState | undefined;
  private trouble: Trouble | undefined;
  private epoch = 0;
  private pending = false;
  private lastHintAt = -Infinity;
  private lastStartAt = -Infinity;
  private timer: ReturnType<typeof setTimeout> | undefined;

  /** `changed` only says something happened; the user then asks `state()`. */
  constructor(
    private readonly changed: () => void,
    options: ProviderQuotaOptions = {},
  ) {
    const now = options.now ?? Date.now;
    this.policy = {
      now,
      intervalMs: Math.max(PROVIDER_QUOTA_INTERVAL_MS, options.intervalMs ?? 0),
      ...(options.fetch ? { fetch: options.fetch } : {}),
    };
    this.gate =
      options.gate ??
      new SharedGate({ root: defaultProviderRoot(), now, flightMs: PROVIDER_QUOTA_FLIGHT_MS });
  }

  /** What to show for the model in use, or undefined when no quota source serves its provider. */
  state(): QuotaState | undefined {
    const model = this.ctx?.model;
    if (!this.source || !model) return undefined;
    if (this.trouble) return { limits: null, status: troubleStatus[this.trouble] };
    const view = this.view();
    return view ? presentGate(view, model) : { limits: null, status: 'quota loading' };
  }

  /** A hint that quota may have changed. Cheap: coalesced, spaced and gate-protected. */
  refresh(ctx: QuotaContext): void {
    this.ctx = ctx;
    const source = quotaSourceFor(ctx.model?.provider);
    if (!source) {
      if (this.source) this.detach();
      return;
    }
    if (source !== this.source) {
      this.detach();
      this.source = source;
    }
    this.lastHintAt = this.policy.now();
    this.run(false);
  }
  pause(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
  dispose(): void {
    this.detach();
    this.ctx = undefined;
  }
  diagnostics() {
    return {
      adapter: this.source?.provider ?? null,
      shared: true,
      failure: this.trouble ?? this.gateState?.failure ?? 'not-requested',
      intervalMs: this.policy.intervalMs,
      ...viewDiagnostics(this.view()),
    };
  }

  /** The gate state seen as the shared view it is at this moment (age and staleness move with time). */
  private view(): SharedQuotaView | undefined {
    return this.gateState && gateView(this.gateState, this.policy.now());
  }
  private detach(): void {
    this.epoch += 1;
    this.pause();
    this.pending = false;
    this.source = undefined;
    this.scope = undefined;
    this.gateState = undefined;
    this.trouble = undefined;
    // A new attachment is a new subscription: the spacing of hints belongs to the old one.
    this.lastStartAt = -Infinity;
  }
  private run(timed: boolean): void {
    const { ctx, source } = this;
    if (!ctx || !source || this.pending) return;
    if (!timed && this.policy.now() - this.lastStartAt < HINT_SPACING_MS) return;
    const epoch = this.epoch;
    this.pending = true;
    this.lastStartAt = this.policy.now();
    this.cycle(ctx, source, epoch)
      .catch((error: unknown) => {
        if (epoch === this.epoch) this.fail(error);
      })
      .finally(() => {
        if (epoch !== this.epoch) return;
        this.pending = false;
        this.schedule();
      })
      .catch(() => undefined);
  }
  /** One-shot wake at the next eligible time, only while the user has been active recently. */
  private schedule(): void {
    this.pause();
    const active = this.policy.now() - this.lastHintAt <= PROVIDER_QUOTA_ACTIVE_MS;
    if (!this.ctx || !this.source || !active) return;
    const wait = Math.min(
      120_000,
      Math.max(1000, this.view()?.nextAttemptInMs ?? this.policy.intervalMs),
    );
    this.timer = setTimeout(() => {
      this.timer = undefined;
      try {
        this.run(true);
      } catch {
        /* A wake never throws into the event loop. */
      }
    }, wait + 250);
    this.timer.unref();
  }
  private fail(error: unknown): void {
    this.trouble = error instanceof QuotaProblem ? error.problem : 'unavailable';
    this.changed();
  }
  private async cycle(
    ctx: QuotaContext,
    source: ProviderQuotaSource,
    epoch: number,
  ): Promise<void> {
    const { credential, scope } = await resolveCredential(ctx, source);
    if (epoch !== this.epoch) return;
    this.trouble = undefined;
    if (scope !== this.scope) {
      this.scope = scope;
      this.gateState = undefined;
      this.changed();
    }
    const previous = await this.show(scope, epoch);
    const reservation = await this.gate.reserve(scope, this.policy.intervalMs);
    if (!reservation || epoch !== this.epoch) return;
    const result = await fetchResult(this.policy, { source, credential, previous });
    await this.gate.finish(scope, reservation.revision, result);
    await this.show(scope, epoch);
  }
  /** Reads the shared gate for the account and remembers it; only the current account counts. */
  private async show(scope: string, epoch: number): Promise<GateState | undefined> {
    const state = await this.gate.view(scope);
    if (epoch !== this.epoch || scope !== this.scope) return state;
    this.gateState = state;
    this.changed();
    return state;
  }
}
