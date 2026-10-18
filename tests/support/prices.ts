import { validRates } from '../../src/core/price-source.js';
import type { PriceSource } from '../../src/core/price-source.js';

/** An in-memory price table keyed by `provider/model`; stands in for Pi's registry in unit tests. */
export function tablePrices(table: Record<string, unknown>): PriceSource {
  return {
    priceFor: (provider, model) => validRates(table[`${provider}/${model}`]),
  };
}

/** Rates the pre-registry tests used for `gpt-6.1-sol` (USD per million tokens). */
export const SOL = { input: 2, cacheRead: 0.1, cacheWrite: 2.5, output: 10 };
export const solPrices = tablePrices({
  'openai-codex/gpt-6.1-sol': SOL,
  'openai-codex/gpt-5.6-sol': { input: 4, cacheRead: 0.4, cacheWrite: 5, output: 20 },
  'openai-codex/gpt-6-astra': { input: 10, cacheRead: 1, cacheWrite: 12.5, output: 50 },
  'openai/gpt-6-luna': { input: 0.1, cacheRead: 0.01, cacheWrite: 0.125, output: 0.5 },
});
