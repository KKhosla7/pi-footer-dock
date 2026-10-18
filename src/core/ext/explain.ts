import { facts, gap } from '../explain/blocks.js';
import type { Explained, Explainer } from '../explain/explainer.js';
import type { Found } from './registry.js';

/**
 * The explanation of an extension's item, in Footer Dock's frame. What the extension supplied is used
 * as it is (it was cleaned and bounded on the way in); without an explanation of its own the item
 * still says what it is and who provides it.
 */
export function extensionExplainer({ registration, item }: Found): Explainer {
  const own = item.explain;
  return {
    id: `${registration.ext}:${item.id}`,
    title: own?.title ?? registration.label,
    reports: own?.reports ?? [`A value shown by ${registration.label}.`],
    missingWhen: own?.missingWhen ?? [`Whenever ${registration.label} has nothing to show for it.`],
    build({ value }): Explained {
      const shown = value !== '';
      return {
        headline: [facts({ label: 'Shows', value: shown ? value : 'nothing right now' })],
        body: [
          ...(own?.blocks ?? []),
          gap,
          facts({ label: 'Provided by', value: registration.label }),
        ],
        status: own?.status ?? { available: shown, text: shown ? 'available' : 'nothing to show' },
      };
    },
  };
}
