import { count, dollars, record } from './usage-values.js';
import type { TokenUsage } from './usage-values.js';
import { zeroPriced } from './price-source.js';
import type { ModelRates, PriceSource, Rates } from './price-source.js';

export type PriceBasis = 'reported' | 'registry';
export interface CostParts {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}
export const NO_PARTS: CostParts = Object.freeze({
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
});
export type PriceFailure = 'missing-model-price' | 'zero-price' | 'invalid-usage';
export type ResponsePrice =
  { amount: number; basis: PriceBasis; parts: CostParts } | { failure: PriceFailure };

export function reportedCost(usage: unknown): number | null {
  return reportedParts(usage)?.total ?? null;
}
export function reportedParts(usage: unknown): (CostParts & { total: number }) | null {
  const cost = record(record(usage)?.cost);
  if (!cost) return null;
  const input = dollars(cost.input);
  const output = dollars(cost.output);
  const cacheRead = dollars(cost.cacheRead);
  const cacheWrite = dollars(cost.cacheWrite);
  const total = dollars(cost.total);
  if (
    total === null ||
    input === null ||
    output === null ||
    cacheRead === null ||
    cacheWrite === null
  )
    return null;
  const sum = input + output + cacheRead + cacheWrite;
  return Math.abs(sum - total) <= 1e-9 + total * 1e-6
    ? { input, output, cacheRead, cacheWrite, total }
    : null;
}
function tierFor(price: ModelRates, inputTokens: number): Rates {
  let selected: Rates = price;
  let threshold = -1;
  for (const tier of price.tiers ?? []) {
    if (inputTokens > tier.inputTokensAbove && tier.inputTokensAbove > threshold) {
      selected = tier;
      threshold = tier.inputTokensAbove;
    }
  }
  return selected;
}
export function partsFromRates(
  price: ModelRates,
  usage: TokenUsage,
  longWrite: number | null,
): { amount: number; parts: CostParts } | null {
  if (longWrite === null || longWrite > usage.cacheWrite) return null;
  const rate = tierFor(price, usage.input + usage.cacheRead + usage.cacheWrite);
  const shortWrite = usage.cacheWrite - longWrite;
  const raw = {
    input: rate.input * usage.input,
    output: rate.output * usage.output,
    cacheRead: rate.cacheRead * usage.cacheRead,
    cacheWrite: rate.cacheWrite * shortWrite + rate.input * 2 * longWrite,
  };
  const amount =
    (rate.input * usage.input +
      rate.output * usage.output +
      rate.cacheRead * usage.cacheRead +
      rate.cacheWrite * shortWrite +
      rate.input * 2 * longWrite) /
    1_000_000;
  const parts = {
    input: raw.input / 1_000_000,
    output: raw.output / 1_000_000,
    cacheRead: raw.cacheRead / 1_000_000,
    cacheWrite: raw.cacheWrite / 1_000_000,
  };
  return Number.isFinite(amount) && amount <= Number.MAX_SAFE_INTEGER ? { amount, parts } : null;
}
export function costFromRates(
  price: ModelRates,
  usage: TokenUsage,
  longWrite: number | null,
): number | null {
  return partsFromRates(price, usage, longWrite)?.amount ?? null;
}
function tokenCount(usage: TokenUsage): number {
  return usage.input + usage.cacheRead + usage.cacheWrite + usage.output;
}
export function priceResponse(
  response: Record<string, unknown>,
  usage: TokenUsage,
  prices: PriceSource,
): ResponsePrice {
  if (tokenCount(usage) === 0) return { amount: 0, basis: 'reported', parts: NO_PARTS };
  const reported = reportedParts(response.usage);
  if (reported !== null && reported.total > 0)
    return { amount: reported.total, basis: 'reported', parts: reported };
  const price = prices.priceFor(String(response.provider), String(response.model));
  if (!price) return { failure: 'missing-model-price' };
  if (zeroPriced(price)) return { failure: 'zero-price' };
  const raw = record(response.usage)?.cacheWrite1h;
  const priced = partsFromRates(price, usage, raw === undefined ? 0 : count(raw));
  if (priced === null) return { failure: 'invalid-usage' };
  return { amount: priced.amount, basis: 'registry', parts: priced.parts };
}
