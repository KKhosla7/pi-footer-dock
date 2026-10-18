import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { modelChoices, modelKey } from '../../core/picker/model-choices.js';
import { safeLabel } from '../../core/model.js';
import { openPicker } from '../../ui/list-picker.js';
import { say } from '../../notify.js';

/** Click on the robot icon: the models Pi can use, searchable; Enter switches to the one chosen. */
export async function pickModel(pi: ExtensionAPI, ctx: ExtensionContext): Promise<void> {
  const available = ctx.modelRegistry.getAvailable();
  if (available.length === 0) {
    say(ctx, 'No models are available. Use /login to add a provider.', 'info');
    return;
  }
  const settings = pi.getSettings();
  const choices = modelChoices(available, ctx.model, {
    provider: settings.defaultProvider,
    model: settings.defaultModel,
  });
  const picked = await openPicker(ctx, {
    title: 'Models',
    searchable: true,
    action: 'Enter select',
    ...(ctx.model ? { start: modelKey(ctx.model) } : {}),
    choices: choices.map((choice) => ({
      id: choice.id,
      search: choice.search,
      detail: `Model name: ${safeLabel(choice.name)}`,
      row: (theme) =>
        `${choice.current ? theme.fg('accent', '✓ ') : '  '}${safeLabel(choice.modelId)} ` +
        theme.fg('muted', `[${safeLabel(choice.provider)}]`) +
        (choice.isDefault ? theme.fg('muted', ' · default') : ''),
    })),
  });
  const model = available.find((candidate) => modelKey(candidate) === picked);
  if (!model || (ctx.model && modelKey(ctx.model) === picked)) return;
  if (!(await pi.setModel(model)))
    say(
      ctx,
      `Could not switch to ${safeLabel(modelKey(model))}: no credentials for it.`,
      'warning',
    );
}
