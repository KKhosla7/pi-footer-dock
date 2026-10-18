import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { asLevel, supportedLevels, thinkingChoices } from '../../core/picker/thinking-choices.js';
import { openPicker } from '../../ui/list-picker.js';
import { say } from '../../notify.js';

/** Click on the brain icon: the thinking levels this model supports; Enter switches to the one chosen. */
export async function pickThinking(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
  const model = ctx.model;
  const levels = model ? supportedLevels(model) : [];
  if (levels.length === 0) {
    say(ctx, 'This model has no thinking levels.', 'info');
    return;
  }
  const current = pi.getThinkingLevel();
  const choices = thinkingChoices(levels, current, pi.getSettings().defaultThinkingLevel);
  const picked = await openPicker(ctx, {
    title: 'Thinking level',
    searchable: true,
    action: 'Enter select',
    start: current,
    choices: choices.map((choice) => ({
      id: choice.id,
      search: choice.search,
      row: (theme) =>
        `${choice.current ? theme.fg('accent', '✓ ') : '  '}${choice.level.padEnd(8)} ` +
        theme.fg('muted', choice.description + (choice.isDefault ? ' · default' : '')),
    })),
  });
  const level = levels.includes(picked ?? '') ? asLevel(picked) : undefined;
  if (level && level !== current) pi.setThinkingLevel(level);
}
