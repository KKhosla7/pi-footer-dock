import { formatProblems, problem } from './problems.js';
import { checkConfig } from './settings-problems.js';

/**
 * What to tell the user when `/dock-config` was given something that cannot be applied: every
 * problem with the setting, the reason and the fix, and that nothing changed.
 */
export function explainConfig(args: string): string {
  const where = '/dock-config';
  if (args.length > 16_384)
    return formatProblems('Nothing changed: the footer configuration was not applied', [
      problem(
        where,
        '(command)',
        'The command is longer than 16 KiB.',
        'Keep only what you want to change, or use the settings file.',
      ),
    ]);
  let value: unknown;
  try {
    value = JSON.parse(args);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'It is not valid JSON.';
    return formatProblems('Nothing changed: the footer configuration was not applied', [
      problem(
        where,
        '(command)',
        `The text after /dock-config is not valid JSON: ${reason}`,
        'Write one JSON object on one line, for example {"shrink":["drop:cost"]}; or use /dock-config show or /dock-config reset.',
      ),
    ]);
  }
  const problems = checkConfig(value, where);
  return problems.length > 0
    ? formatProblems('Nothing changed: the footer configuration was not applied', problems)
    : 'Nothing changed: the footer configuration was not applied: it is not valid (two rows, unique slots).';
}
