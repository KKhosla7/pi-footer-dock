import { NO_PRICES } from './price-source.js';
import type { PriceSource } from './price-source.js';
import { CostBreakdownAccumulator, modelKey } from './cost-breakdown.js';
import type { CostBreakdown } from './cost-breakdown.js';
import { priceResponse } from './response-price.js';
import type { PriceBasis } from './response-price.js';
import { add, record, tokenUsage } from './usage-values.js';
import type { TokenUsage } from './usage-values.js';
export type CostReason =
  | 'missing-usage'
  | 'invalid-usage'
  | 'unassigned-model'
  | 'missing-model-price'
  | 'zero-price'
  | 'duplicate-entry'
  | 'invalid-entry'
  | 'overflow';
export interface ApiCostEstimate {
  amount: number | null;
  responses: number;
  unavailable: number;
  /** Complete amount stays null when coverage is partial. */
  pricedAmount?: number | null;
  pricedResponses?: number;
  coverage?: 'complete' | 'partial' | 'none';
  reasons?: Partial<Record<CostReason, number>>;
  models?: Readonly<Record<string, number>>;
  tokens?: TokenUsage;
  /** How many priced responses used Pi's recorded cost versus a repricing from its registry. */
  pricedBy?: Readonly<Record<PriceBasis, number>>;
  /** Where the priced money went, by category and by model. */
  breakdown?: CostBreakdown;
}
function failure(response: Record<string, unknown>, usage: TokenUsage | null): CostReason | null {
  if (response.usage === undefined || response.usage === null) return 'missing-usage';
  if (!usage) return 'invalid-usage';
  return typeof response.provider !== 'string' || typeof response.model !== 'string'
    ? 'unassigned-model'
    : null;
}
/** Metadata only. Never retains messages, credentials or raw session entries. */
export class ApiCostAccumulator {
  private amount: number | null = 0;
  private responses = 0;
  private unavailable = 0;
  private readonly reasons: Partial<Record<CostReason, number>> = {};
  private readonly models = new Map<string, number>();
  private readonly tokens: TokenUsage = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
  private readonly pricedBy: Record<PriceBasis, number> = { reported: 0, registry: 0 };
  private readonly breakdown = new CostBreakdownAccumulator();
  constructor(private readonly prices: PriceSource = NO_PRICES) {}
  reject(reason: CostReason): void {
    this.responses += 1;
    this.unavailable += 1;
    this.reasons[reason] = (this.reasons[reason] ?? 0) + 1;
  }
  add(value: unknown): void {
    const response = record(value) ?? {};
    const usage = tokenUsage(response.usage);
    const reason = failure(response, usage);
    this.modelCount(response.model);
    if (reason || !usage) {
      this.reject(reason ?? 'invalid-usage');
      return;
    }
    const price = priceResponse(response, usage, this.prices);
    if ('failure' in price) {
      this.reject(price.failure);
      return;
    }
    const totals = { ...this.tokens };
    for (const key of ['input', 'cacheRead', 'cacheWrite', 'output'] as const) {
      const total = add(totals[key], usage[key]);
      if (total === null) {
        this.reject('overflow');
        return;
      }
      totals[key] = total;
    }
    const amount = add(this.amount, price.amount);
    if (amount === null) {
      this.reject('overflow');
      this.amount = null;
      return;
    }
    this.amount = amount;
    Object.assign(this.tokens, totals);
    this.pricedBy[price.basis] += 1;
    this.breakdown.add(
      modelKey(response.provider, response.model),
      usage,
      price.parts,
      price.basis,
    );
    this.responses += 1;
  }
  private modelCount(value: unknown): void {
    const model =
      typeof value === 'string' && /^[\w./-]{1,128}$/u.test(value) ? value : '(unassigned)';
    const key = this.models.has(model) || this.models.size < 16 ? model : '(other)';
    this.models.set(key, (this.models.get(key) ?? 0) + 1);
  }
  private safeSubtotal(): boolean {
    return (
      this.responses > this.unavailable &&
      this.amount !== null &&
      !this.reasons['duplicate-entry'] &&
      !this.reasons['invalid-entry'] &&
      !this.reasons.overflow
    );
  }
  snapshot(): ApiCostEstimate {
    const pricedAmount = this.safeSubtotal() ? this.amount : null;
    return {
      amount: this.unavailable ? null : pricedAmount,
      pricedAmount,
      pricedResponses: this.responses - this.unavailable,
      coverage: pricedAmount === null ? 'none' : this.unavailable ? 'partial' : 'complete',
      responses: this.responses,
      unavailable: this.unavailable,
      reasons: { ...this.reasons },
      models: Object.fromEntries(this.models),
      tokens: { ...this.tokens },
      pricedBy: { ...this.pricedBy },
      breakdown: this.breakdown.snapshot(),
    };
  }
}
/** Exact historical model/token categories, not the currently selected model. */
export function estimateApiCost(
  responses: readonly unknown[],
  prices: PriceSource = NO_PRICES,
): ApiCostEstimate {
  const accumulator = new ApiCostAccumulator(prices);
  for (const response of responses) accumulator.add(response);
  return accumulator.snapshot();
}
const NO_COST = '≈cost n/a';
export function costAmount(amount: number | null | undefined): string {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0) return NO_COST;
  return amount > 0 && amount < 0.01 ? '≈<$0.01' : `≈$${amount.toFixed(2)}`;
}
/**
 * The footer label. A partial total is a lower bound, so a trailing `+` ("at least") says so in one
 * character; under a cent the bound says nothing, so nothing is drawn. The explanation has the rest.
 */
export function costLabel(estimate: ApiCostEstimate | undefined): string {
  if (estimate?.coverage === 'partial') {
    const subtotal = estimate.pricedAmount;
    return typeof subtotal === 'number' && subtotal >= 0.01 ? `${costAmount(subtotal)}+` : NO_COST;
  }
  return costAmount(estimate?.amount);
}
/** Whether there is any amount to show, whole or partial; the footer shows nothing otherwise. */
export function hasCost(estimate: ApiCostEstimate | undefined): boolean {
  return costLabel(estimate) !== NO_COST;
}
