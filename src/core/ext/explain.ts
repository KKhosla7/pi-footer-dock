import { facts, gap } from '../explain/blocks.js';
import type { Explained, Explainer } from '../explain/explainer.js';
import type { Found } from './registry.js';

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
