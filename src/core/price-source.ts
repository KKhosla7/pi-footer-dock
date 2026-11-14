import { dollars, record } from './usage-values.js';

export interface Rates {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}
export interface RateTier extends Rates {
  inputTokensAbove: number;
}
export interface ModelRates extends Rates {
  tiers?: readonly RateTier[];
}
export interface PriceSource {
  priceFor(provider: string, model: string): ModelRates | undefined;
}
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
export function zeroPriced(price: ModelRates): boolean {
  return price.input === 0 && price.output === 0 && price.cacheRead === 0 && price.cacheWrite === 0;
}
