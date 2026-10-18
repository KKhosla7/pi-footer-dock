import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { ExtensionBus } from './adapters/ext-bus.js';
import { extensionEntries, parseRowId } from './core/ext/menu.js';
import type { FooterInteractions } from './footer-interactions.js';
import type { SettingsController } from './settings-controller.js';
import { openSettingsScreen } from './ui/settings-screen.js';
import { say } from './notify.js';

export interface SettingsCommand {
  /** The extension protocol: other extensions' settings groups appear in the menu. */
  extensions: ExtensionBus;
  settings: SettingsController;
  interactions: FooterInteractions;
  /** Quota window labels the provider publishes right now. */
  windows: () => string[];
  /** The icon set changed: the footer is rebuilt once the menu has closed. */
  iconsChanged: () => void;
  /** Asking providers for limits was switched: start or stop at once. */
  limitsChanged: () => void;
}

/** `/dock-settings`: the menu in the TUI, the effective settings as text anywhere else. */
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
  const iconsBefore = settings.current.glyphs;
  await openSettingsScreen(ctx, {
    current: () => settings.current,
    windows: command.windows,
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
      interactions.settingsChanged(previous);
      if (next.limits !== previous.limits) command.limitsChanged();
      if (failure) say(ctx, failure, 'warning');
    },
  });
  if (settings.current.glyphs !== iconsBefore) command.iconsChanged();
}
