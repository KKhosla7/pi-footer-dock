import { layerNames } from './looks.js';
import { closest } from './problems.js';
import type { SlotOptions } from './slot-options.js';

export const layerOn = (options: SlotOptions, name: string): boolean =>
  options.layers?.[name] !== false;

export function checkLayers(id: string, options: SlotOptions): void {
  const set = Object.keys(options.layers ?? {});
  if (set.length === 0) return;
  const known = layerNames.get(id);
  if (!known) throw new Error(`Layers are not available for ${id}`);
  for (const name of set) {
    if (known.includes(name)) continue;
    const near = closest(name, known);
    throw new Error(
      `Unknown layer for ${id}: ${name.slice(0, 24)}. ${near ? `Did you mean ${near}?` : `Use ${known.join(' or ')}.`}`,
    );
  }
}
