import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { NAMES } from './core/product.js';
import { OpenAIHeaderQuota } from './adapters/openai-header-quota.js';
import { ProviderQuotaService } from './adapters/provider-quota-service.js';
import type { ProviderQuotaOptions } from './adapters/provider-quota-service.js';
import { restoreRateLimits } from './adapters/snapshot.js';
import type { QuotaState } from './core/quota-presentation.js';
import { parseRateLimits } from './core/rate-limits.js';
import { quotaSourceFor } from './quota-sources/registry.js';

const ENTRY = NAMES.limitsEntry;
const NONE: QuotaState = { limits: null, status: null };
const OFF: QuotaState = { limits: null, status: 'limits off' };
const observedNow = () => ({ ageMs: 0, receivedMono: performance.now(), observedAt: Date.now() });

/**
 * Composes the quota to show; it stores no copy of what a source knows. A quota source that serves
 * the provider is the only authority for it. For any other provider the observation pushed by
 * response headers or stream events counts, then the one restored from the session.
 */
export class QuotaController {
  private ctx: ExtensionContext | undefined;
  private key = '';
  private pushed: QuotaState | undefined;
  private restored: QuotaState = NONE;
  private readonly provider: ProviderQuotaService;
  private readonly headers: OpenAIHeaderQuota;
  private events = { received: 0, parsed: 0, accepted: 0 };

  constructor(
    private readonly pi: ExtensionAPI,
    private readonly changed: () => void,
    providerOptions: ProviderQuotaOptions = {},
    private readonly enabled: () => boolean = () => true,
  ) {
    this.provider = new ProviderQuotaService(changed, providerOptions);
    this.headers = new OpenAIHeaderQuota((limits) => {
      this.pushed = { limits, status: null, freshness: observedNow() };
      this.pi.appendEntry(ENTRY, limits);
      changed();
    });
  }

  /** What to show right now for the model in use. */
  snapshot(): QuotaState {
    if (!this.enabled() && quotaSourceFor(this.ctx?.model?.provider ?? '')) return OFF;
    return this.provider.state() ?? this.pushed ?? this.restored;
  }
  start(ctx: ExtensionContext): void {
    this.stop();
    this.updateContext(ctx);
    this.resume();
  }
  /** The footer is on screen again: ask once; the service then schedules itself while you are active. */
  resume(): void {
    if (this.ctx && this.enabled()) this.provider.refresh(this.ctx);
  }
  /** The session or its model may have changed: what was pushed for another model is dropped. */
  updateContext(ctx: ExtensionContext): void {
    this.ctx = ctx;
    const key = `${ctx.model?.provider ?? ''}/${ctx.model?.id ?? ''}`;
    if (key !== this.key) {
      this.key = key;
      this.pushed = undefined;
      this.headers.invalidate();
      const limits = restoreRateLimits(ctx);
      this.restored = limits ? { limits, status: null } : NONE;
    }
    if (this.enabled()) this.provider.refresh(ctx);
    else this.provider.pause();
  }
  refresh(ctx: ExtensionContext): void {
    this.updateContext(ctx);
  }
  begin(ctx: ExtensionContext): void {
    this.headers.begin(ctx);
  }
  ingestHeaders(headers: Record<string, string>, ctx: ExtensionContext): void {
    this.headers.ingest(headers, ctx);
  }
  ingest(event: { provider: string; model: string; data: unknown }): void {
    this.events.received += 1;
    const parsed = parseRateLimits(event.provider, event.model, event.data);
    if (!parsed) return;
    this.events.parsed += 1;
    const model = this.ctx?.model;
    if (
      !model ||
      model.provider === 'openai' ||
      quotaSourceFor(model.provider) ||
      model.provider !== parsed.provider ||
      model.id !== parsed.model
    )
      return;
    this.events.accepted += 1;
    if (JSON.stringify(parsed) !== JSON.stringify(this.pushed?.limits ?? this.restored.limits))
      this.pi.appendEntry(ENTRY, parsed);
    this.pushed = { limits: parsed, status: null, freshness: observedNow() };
    this.changed();
  }
  diagnostics() {
    return {
      quotaEvents: { ...this.events },
      quotaProvider: this.provider.diagnostics(),
      headerEvents: this.headers.diagnostics(),
    };
  }
  pause(): void {
    this.provider.pause();
  }
  stop(): void {
    this.pause();
    this.ctx = undefined;
    this.key = '';
    this.provider.dispose();
    this.headers.stop();
    this.pushed = undefined;
    this.restored = NONE;
    this.events = { received: 0, parsed: 0, accepted: 0 };
  }
}
