import type { Explainer } from './explainer.js';
import { cache } from './items/cache.js';
import { catalogue } from './items/catalogue.js';
import { compaction, contextUsage } from './items/context.js';
import { cost } from './items/cost.js';
import { quota } from './items/quota.js';
import { speed } from './items/speed.js';

/** Every item that has an explainer; an item not listed falls back to its plain help text. */
export const explainers: readonly Explainer[] = [
  ...catalogue,
  contextUsage,
  compaction,
  cache,
  quota,
  cost,
  speed,
];

const byId = new Map(explainers.map((explainer) => [explainer.id, explainer]));
export const explainerFor = (id: string): Explainer | undefined => byId.get(id);
