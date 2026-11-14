import type { Settings } from './core/settings.js';
import { ProblemsController } from './problems-controller.js';
import type { TUI } from '@earendil-works/pi-tui';
import { openFolder } from './adapters/folder-opener.js';
import type { ExtensionBus } from './adapters/ext-bus.js';
import type { OpenResult } from './adapters/folder-opener.js';
import type { ProblemsHost } from './problems-controller.js';
import type { Glyphs } from './ui/glyphs.js';
import type { SettingsController } from './settings-controller.js';

export interface InteractionHost {
  redraw: () => void;
  glyphs: () => Glyphs;
  settings: () => Settings;
  openFolder: (directory: string) => Promise<OpenResult>;
  problems: ProblemsHost;
  extensions: ExtensionBus;
}

export function footerHost(
  tui: () => TUI | undefined,
  settings: SettingsController,
  extensions: ExtensionBus,
  interactions: () => { settingsChanged: (before: Settings) => void },
): InteractionHost {
  const problems = new ProblemsController({ settings, tui, interactions });
  return {
    extensions,
    redraw: () => tui()?.requestRender(),
    glyphs: () => settings.glyphs,
    settings: () => settings.current,
    openFolder: (directory: string) => openFolder(directory, settings.current.openWith),
    problems,
  };
}
