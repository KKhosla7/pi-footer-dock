import { isPrimaryCompletion } from './primary-completion.js';
import { count } from './usage-values.js';

interface Result {
  output: unknown;
  stopReason: string;
  durationMs: unknown;
  reasoning?: unknown;
  deferred?: unknown;
}
export interface ResponseTiming {
  output: number;
  durationMs: number;
  rate: number;
  reasoning: number | null;
  firstContentMs: number | null;
  firstTextMs: number | null;
}
/** Why a finished response has no figure: the provider gave no duration, a tiny one, or no output. */
export type Unmeasured = 'no-duration' | 'too-short' | 'no-output';
const deltas = new Set(['text_delta', 'thinking_delta', 'toolcall_delta']);

/** Keep tiny positive rates nonzero without inventing precision. */
export function formatResponseRate(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '—';
  return value < 0.1 ? '<0.1' : value.toFixed(1);
}

function measured(result: Result) {
  const output = count(result.output);
  const durationMs = result.durationMs;
  if (output === null || output === 0) return null;
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs < 20)
    return null;
  const rate = output / (durationMs / 1000);
  return Number.isFinite(rate) && rate > 0 ? { output, durationMs, rate } : null;
}

function whyUnmeasured(result: Result): Unmeasured {
  const output = count(result.output);
  if (output === null || output === 0) return 'no-output';
  const duration = result.durationMs;
  return typeof duration === 'number' && Number.isFinite(duration) && duration > 0
    ? 'too-short'
    : 'no-duration';
}

/** SDK-timed reported throughput; local time only anchors observed first-content latency. */
export class ResponseSpeed {
  private started: number | undefined;
  private firstContent: number | null = null;
  private firstText: number | null = null;
  value: number | null = null;
  sample: ResponseTiming | null = null;
  /** After a successful response without a figure: the reason; otherwise null. */
  unmeasured: Unmeasured | null = null;

  constructor(private readonly now: () => number = () => performance.now()) {}

  start(): void {
    this.reset();
    const now = this.now();
    if (Number.isFinite(now)) this.started = now;
  }

  update(type: string, delta: unknown): void {
    if (this.started === undefined || !deltas.has(type)) return;
    if (typeof delta !== 'string' || delta.length === 0) return;
    if (this.firstContent !== null && (type !== 'text_delta' || this.firstText !== null)) return;
    const elapsed = this.now() - this.started;
    if (!Number.isFinite(elapsed) || elapsed < 0) return;
    this.firstContent ??= elapsed;
    if (type === 'text_delta') this.firstText = elapsed;
  }

  /** True only for a paired successful primary completion, even when timing is unavailable. */
  end(result: Result): boolean {
    if (this.started === undefined) return false;
    this.started = undefined;
    if (!isPrimaryCompletion(result.stopReason, result.deferred)) {
      this.value = null;
      this.sample = null;
      this.unmeasured = null;
      return false;
    }
    const timing = measured(result);
    this.unmeasured = timing ? null : whyUnmeasured(result);
    this.value = timing?.rate ?? null;
    const reasoning = count(result.reasoning);
    this.sample = timing
      ? {
          ...timing,
          reasoning: reasoning !== null && reasoning <= timing.output ? reasoning : null,
          firstContentMs: this.firstContent,
          firstTextMs: this.firstText,
        }
      : null;
    return true;
  }

  reset(): void {
    this.started = undefined;
    this.firstContent = null;
    this.firstText = null;
    this.value = null;
    this.sample = null;
    this.unmeasured = null;
  }
}
