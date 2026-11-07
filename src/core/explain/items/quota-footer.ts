import { layerOn } from '../../layers.js';
import { bullets, heading, note } from '../blocks.js';
import type { Block } from '../blocks.js';

/**
 * What the footer's limit text means. The footer has no words for it, so this is where the number
 * is said to be the share left or the share used, and where to change it. The parts the user
 * switched off (the `layers` setting) are left out of the description.
 */
export function inTheFooter(shows: 'left' | 'used', layers?: Record<string, boolean>): Block[] {
  const other = shows === 'left' ? 'used' : 'left';
  const on = (name: string): boolean => layerOn({ ...(layers ? { layers } : {}) }, name);
  const parts = [
    'its name',
    ...(on('meter') ? ['a bar'] : []),
    `the percent ${shows}`,
    ...(on('reset') ? ['then the reload icon and the time until it resets'] : []),
  ];
  return [
    heading('In the footer'),
    note(
      `Each window reads: ${parts.join(', ')}. The number is what is ${shows}${on('meter') ? ' (the bar follows it)' : ''}; the colour always follows what is left.`,
    ),
    bullets({
      term: `Show ${other} instead`,
      text: `/dock-settings, Limit usage, "Limit shows": ${other}.`,
    }),
  ];
}
