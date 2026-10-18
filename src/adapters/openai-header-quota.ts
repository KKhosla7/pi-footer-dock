import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { parseOpenAIRateHeaders } from '../core/openai-rate-headers.js';
import type { RateLimits } from '../core/rate-limits.js';

type Source = Pick<ExtensionContext, 'model'>;
/** Tie response metadata to a captured request model; discard on model/lifecycle changes. */
export class OpenAIHeaderQuota {
  readonly events = { received: 0, accepted: 0 };
  private requestModel: { provider: string; model: string } | undefined;
  private lastResult = 'not-observed';
  private presentFields: string[] = [];
  constructor(private readonly publish: (limits: RateLimits) => void) {}
  begin(ctx: Source): void {
    this.requestModel = ctx.model
      ? { provider: ctx.model.provider, model: ctx.model.id }
      : undefined;
  }
  ingest(headers: Record<string, string>, ctx: Source): void {
    this.events.received += 1;
    const names = new Set(Object.keys(headers).map((name) => name.toLowerCase()));
    this.presentFields = ['tokens', 'requests']
      .flatMap((unit) =>
        ['limit', 'remaining', 'reset'].map((kind) => `x-ratelimit-${kind}-${unit}`),
      )
      .filter((name) => names.has(name));
    const model = ctx.model;
    if (model?.provider !== 'openai') {
      this.lastResult = 'unsupported-provider';
      return;
    }
    if (this.requestModel?.provider !== model.provider || this.requestModel.model !== model.id) {
      this.lastResult = 'request-model-mismatch';
      return;
    }
    const parsed = parseOpenAIRateHeaders(model.id, headers);
    if (!parsed) {
      this.lastResult = 'missing-or-invalid-rate-headers';
      return;
    }
    this.lastResult = 'accepted';
    this.events.accepted += 1;
    this.publish(parsed);
  }
  diagnostics() {
    return {
      ...this.events,
      lastResult: this.lastResult,
      presentFields: this.presentFields.slice(),
    };
  }
  invalidate(): void {
    this.requestModel = undefined;
  }
  stop(): void {
    this.invalidate();
    this.events.received = 0;
    this.events.accepted = 0;
    this.lastResult = 'not-observed';
    this.presentFields = [];
  }
}
