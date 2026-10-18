import { dollars, record } from './usage-values.js';

/** USD per million tokens, the unit Pi's model registry and models.dev both use. */
export interface Rates {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}
/** Applies when a response's total input tokens exceed `inputTokensAbove`. */
export interface RateTier extends Rates {
  inputTokensAbove: number;
}
export interface ModelRates extends Rates {
  tiers?: readonly RateTier[];
}
/**
 * Where per-model prices come from. A later source (a refreshed models.dev table) implements
 * this same method, so the accumulator never learns where a price originated. Must not throw.
 */
export interface PriceSource {
  priceFor(provider: string, model: string): ModelRates | undefined;
}
/** Knows no prices: only a response's own recorded cost can then be used. */
export const NO_PRICES: PriceSource = Object.freeze({ priceFor: () => undefined });

const MAX_TIERS = 16;
function rates(value: unknown): Rates | undefined {
  const item = record(value);
  const input = dollars(item?.input);
  const output = dollars(item?.output);
  const cacheRead = dollars(item?.cacheRead);
  const cacheWrite = dollars(item?.cacheWrite);
  return input === null || output === null || cacheRead === null || cacheWrite === null
    ? undefined
    : { input, output, cacheRead, cacheWrite };
}
/** Copies untrusted catalog data into a validated shape; any invalid field means no price. */
export function validRates(value: unknown): ModelRates | undefined {
  const base = rates(value);
  if (!base) return undefined;
  const raw = record(value)?.tiers;
  if (raw === undefined) return base;
  if (!Array.isArray(raw) || raw.length > MAX_TIERS) return undefined;
  const tiers: RateTier[] = [];
  for (const item of raw) {
    const tier = rates(item);
    const above = dollars(record(item)?.inputTokensAbove);
    if (!tier || above === null) return undefined;
    tiers.push({ ...tier, inputTokensAbove: above });
  }
  return { ...base, tiers };
}
/** A price of zero everywhere is a placeholder (unpriced or subscription), never a known free tier. */
export function zeroPriced(price: ModelRates): boolean {
  return price.input === 0 && price.output === 0 && price.cacheRead === 0 && price.cacheWrite === 0;
}
