import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { validRates } from '../core/price-source.js';
import type { PriceSource } from '../core/price-source.js';

export function registryPrices(
  registry: Pick<ExtensionContext['modelRegistry'], 'find'>,
): PriceSource {
  return {
    priceFor(provider, model) {
      try {
        return validRates(registry.find(provider, model)?.cost);
      } catch {
        return undefined;
      }
    },
  };
}
