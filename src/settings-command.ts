import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { ExtensionBus } from './adapters/ext-bus.js';
import { extensionEntries, parseRowId } from './core/ext/menu.js';
import type { FooterInteractions } from './footer-interactions.js';
import type { SettingsController } from './settings-controller.js';
import type { Background } from './ui/palette.js';
import { openSettingsScreen } from './ui/settings-screen.js';
import { say } from './notify.js';

export interface SettingsCommand {
  extensions: ExtensionBus;
  settings: SettingsController;
  interactions: FooterInteractions;
  windows: () => string[];
  iconsChanged: () => void;
  limitsChanged: () => void;
  background: () => Background | undefined;
}

export async function runSettingsCommand(
  ctx: ExtensionContext,
  command: SettingsCommand,
): Promise<void> {
  const { settings, interactions } = command;
  if (ctx.mode !== 'tui') {
    say(ctx, JSON.stringify(settings.current, null, 2), 'info');
    return;
  }
  settings.load((message) => {
    say(ctx, message, 'warning');
  });
  interactions.problems.load();
  if (interactions.problems.state.count > 0) return interactions.problems.open(ctx);
  const iconsBefore = settings.current.glyphs;
  await openSettingsScreen(ctx, {
    current: () => settings.current,
    windows: command.windows,
    colours: { background: command.background },
    icons: () => settings.iconKind,
    extensions: {
      entries: () => extensionEntries(command.extensions.registry),
      pick: (id, value) => {
        const row = parseRowId(id);
        if (row) command.extensions.setting(row.ext, row.row, value);
      },
    },
    change: (next) => {
      const previous = settings.current;
      const failure = settings.update(next);
      if (next.glyphs !== previous.glyphs) settings.followSavedGlyphs();
      interactions.settingsChanged(previous);
      if (next.limits !== previous.limits) command.limitsChanged();
      if (failure) say(ctx, failure, 'warning');
    },
  });
  if (settings.current.glyphs !== iconsBefore) command.iconsChanged();
}
