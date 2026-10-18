import { ApiCostAccumulator } from './api-cost.js';
import type { ApiCostEstimate } from './api-cost.js';
import type { TokenTotals } from './model.js';
import type { PriceSource } from './price-source.js';
import { add, count, dollars, record } from './usage-values.js';

export interface SessionUsage {
  totals: TokenTotals;
  apiCostEstimate: ApiCostEstimate;
}
/** The part of a session entry that carries usage (a response, a usage entry, a summary), if any. */
export function contribution(entry: Record<string, unknown>): Record<string, unknown> | null {
  if (entry.type === 'message') {
    const message = record(entry.message);
    if (message?.role === 'assistant') return message;
    return message?.usage === undefined ? null : { usage: message.usage };
  }
  if (entry.type === 'usage') return entry;
  if (entry.usage !== undefined) return { usage: entry.usage }; // No supported attribution on summaries/other entry types.
  return null;
}
function fingerprint(value: Record<string, unknown>): string {
  const usage = record(value.usage);
  const cost = record(usage?.cost);
  const label = (item: unknown) =>
    typeof item === 'string' && item.length <= 128 ? item : '(invalid)';
  const numeric = (item: unknown) => (typeof item === 'number' ? item : typeof item);
  return JSON.stringify([
    label(value.provider),
    label(value.model),
    ...[usage?.input, usage?.output, usage?.cacheRead, usage?.cacheWrite, cost?.total].map(numeric),
  ]);
}
function addUsage(totals: TokenTotals, usage: Record<string, unknown> | null): TokenTotals {
  return {
    input: add(totals.input, count(usage?.input)),
    output: add(totals.output, count(usage?.output)),
    cacheRead: add(totals.cacheRead, count(usage?.cacheRead)),
    cacheWrite: add(totals.cacheWrite, count(usage?.cacheWrite)),
    cost: add(totals.cost, dollars(record(usage?.cost)?.total)),
  };
}
/** Session-wide recorded charges, including inactive branches. No transcript is retained. */
export class UsageLedger {
  private readonly costs: ApiCostAccumulator;
  private readonly seen = new Map<string, string>();
  private totals: TokenTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 };
  parsedEntries = 0;
  constructor(prices?: PriceSource) {
    this.costs = new ApiCostAccumulator(prices);
  }
  append(entries: readonly unknown[]): void {
    for (const value of entries) this.entry(value);
  }
  private entry(value: unknown): void {
    this.parsedEntries += 1;
    const entry = record(value);
    if (!entry) return;
    const item = contribution(entry);
    if (!item) return;
    const signature = fingerprint(item);
    const id = typeof entry.id === 'string' && entry.id.length > 0 ? entry.id : null;
    if (!id) {
      this.invalidate();
      this.costs.reject('invalid-entry');
      return;
    }
    if (this.duplicate(id, signature)) return;
    this.totals = addUsage(this.totals, record(item.usage));
    this.costs.add(item);
  }
  private duplicate(id: string, signature: string): boolean {
    const previous = this.seen.get(id);
    if (previous === undefined) {
      this.seen.set(id, signature);
      return false;
    }
    if (previous !== signature) {
      this.invalidate();
      this.costs.reject('duplicate-entry');
    }
    return true;
  }
  private invalidate(): void {
    this.totals = { input: null, output: null, cacheRead: null, cacheWrite: null, cost: null };
  }
  snapshot(): SessionUsage {
    return { totals: { ...this.totals }, apiCostEstimate: this.costs.snapshot() };
  }
}
export function sessionUsage(entries: readonly unknown[], prices?: PriceSource): SessionUsage {
  const ledger = new UsageLedger(prices);
  ledger.append(entries);
  return ledger.snapshot();
}
