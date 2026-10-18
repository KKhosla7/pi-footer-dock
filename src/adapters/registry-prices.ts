import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { validRates } from '../core/price-source.js';
import type { PriceSource } from '../core/price-source.js';

/**
 * Prices from Pi's own model registry: the catalog bundled with Pi plus models.json and
 * extension-registered providers. Read-only and offline; the registry is looked up live, so a
 * registry refresh is picked up on the next repricing.
 */
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
