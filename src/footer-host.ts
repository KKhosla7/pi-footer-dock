import type { TUI } from '@earendil-works/pi-tui';
import { openFolder } from './adapters/folder-opener.js';
import type { ExtensionBus } from './adapters/ext-bus.js';
import type { SettingsController } from './settings-controller.js';

/** Everything the footer's interactions read from the running session, in one place. */
export function footerHost(
  tui: () => TUI | undefined,
  settings: SettingsController,
  extensions: ExtensionBus,
) {
  return {
    extensions,
    redraw: () => tui()?.requestRender(),
    glyphs: () => settings.glyphs,
    settings: () => settings.current,
    openFolder: (directory: string) => openFolder(directory, settings.current.openWith),
  };
}
