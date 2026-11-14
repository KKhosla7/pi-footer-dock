import { groupText, rowLabel } from '../../settings-labels.js';
import { layerOn } from '../../layers.js';
import { bullets, heading, note } from '../blocks.js';
import type { Block } from '../blocks.js';

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
      text: `/dock-settings, ${groupText.quota?.label ?? ''}, "${rowLabel('wording')}": ${other}.`,
    }),
  ];
}
