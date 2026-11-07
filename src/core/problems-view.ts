import { facts, gap, heading, note } from './explain/blocks.js';
import type { Block } from './explain/blocks.js';
import type { Problem } from './problems.js';

/** The lines above the list: what happened and what to do about it. */
export function problemsHeader(problems: readonly Problem[]): Block[] {
  if (problems.length === 0)
    return [
      note('Footer Dock has no configuration problems. Your settings are applied.', 'success'),
    ];
  return [
    note(
      'Footer Dock did not apply your settings file, so it is running on its defaults. Nothing in the file was changed.',
      'warning',
    ),
    note('Fix the file, then press r here to apply it, or restart Pi.'),
    gap,
  ];
}

/** Every problem with where it is, which setting, what is wrong and what to change. */
export function problemBlocks(problems: readonly Problem[]): Block[] {
  return problems.flatMap((item, index) => [
    heading(`Problem ${index + 1} of ${problems.length}`),
    facts(
      { label: 'Where', value: item.where },
      { label: 'Setting', value: item.setting },
      { label: 'What is wrong', value: item.reason, tone: 'warning' },
      { label: 'Fix', value: item.fix, tone: 'success' },
    ),
    gap,
  ]);
}
