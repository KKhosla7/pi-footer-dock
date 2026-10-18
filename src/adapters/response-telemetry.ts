import type { AssistantMessage, AssistantMessageEvent } from '@earendil-works/pi-ai';
import { isPrimaryCompletion } from '../core/primary-completion.js';
import { ResponseSpeed } from '../core/response-speed.js';
import { readCachePolicy, readCacheUsage } from '../core/cache-usage.js';
import type { CacheUsage } from '../core/cache-usage.js';
import { record } from '../core/usage-values.js';

/** Primary-turn telemetry only. No payload/delta retention, I/O, timers or background calls. */
export class ResponseTelemetry {
  readonly speed = new ResponseSpeed();
  private cache: CacheUsage | null = null;
  /** A turn has started and its response has not finished yet. */
  private open = false;
  /** When the last successful response ended; the idle time is measured from it. */
  private lastEnd: number | null = null;
  private pendingIdle: number | null = null;
  private cacheIdle: number | null = null;

  constructor(private readonly now: () => number = () => Date.now()) {}

  start(): void {
    this.open = true;
    this.pendingIdle = this.lastEnd === null ? null : Math.max(0, this.now() - this.lastEnd);
    this.speed.start();
  }
  update(event: AssistantMessageEvent): void {
    this.speed.update(event.type, 'delta' in event ? event.delta : undefined);
  }
  complete(message: AssistantMessage): void {
    const usage = record(message.usage);
    const paired = this.open;
    this.open = false;
    this.speed.end({
      output: usage?.output,
      stopReason: message.stopReason,
      durationMs: message.durationMs,
      reasoning: usage?.reasoning,
      deferred: message.deferred,
    });
    // The cache sample is a fact about a finished response, not about how fast it was.
    if (paired && isPrimaryCompletion(message.stopReason, message.deferred)) {
      this.cache = readCacheUsage(usage);
      this.cacheIdle = this.pendingIdle;
      this.lastEnd = this.now();
    }
  }
  snapshot(policy: unknown) {
    return {
      outputTokensPerSecond: this.speed.value,
      responseTiming: this.speed.sample ? { ...this.speed.sample } : null,
      speedUnmeasured: this.speed.unmeasured,
      cacheUsage: this.cache ? { ...this.cache } : null,
      cacheIdleMs: this.cache ? this.cacheIdle : null,
      cachePolicy: readCachePolicy(policy),
    };
  }
  reset(): void {
    this.open = false;
    this.lastEnd = null;
    this.pendingIdle = null;
    this.cacheIdle = null;
    this.speed.reset();
    this.cache = null;
  }
}
