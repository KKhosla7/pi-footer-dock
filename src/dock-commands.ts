import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { diagnosticReport } from './adapters/diagnostics.js';
import type { ExtensionBus } from './adapters/ext-bus.js';
import type { FooterColours } from './footer-colours.js';
import type { FooterInteractions } from './footer-interactions.js';
import { runSettingsCommand } from './settings-command.js';
import type { SettingsController } from './settings-controller.js';

type Report = Omit<Parameters<typeof diagnosticReport>[0], 'command' | 'source' | 'footerSlots'>;

export interface CommandHost {
  readonly settings: SettingsController;
  readonly interactions: FooterInteractions;
  readonly colours: FooterColours;
  readonly extensions: ExtensionBus;
  diagnosticInput: () => Report;
  windowLabels: () => string[];
  refreshLimits: (ctx: ExtensionContext) => void;
  start: (ctx: ExtensionContext) => void;
  reportError: (ctx: ExtensionContext, error: unknown) => void;
}

export class DockCommands {
  constructor(private readonly host: CommandHost) {}

  diagnostics(ctx: ExtensionContext): string {
    const { config } = this.host.interactions;
    return diagnosticReport({
      command: ctx,
      source: import.meta.url,
      ...this.host.diagnosticInput(),
      footerSlots: config.rows.flatMap((row) => [...row.left, ...row.right]),
    });
  }

  contextAction(ctx: ExtensionContext): Promise<void> {
    return this.host.interactions.invokeTarget('context', ctx).catch((error: unknown) => {
      this.host.reportError(ctx, error);
    });
  }

  toggleGlyphs(ctx: ExtensionContext): void {
    this.host.settings.toggleGlyphs();
    this.host.start(ctx);
  }

  openSettings(ctx: ExtensionContext): Promise<void> {
    const { settings, interactions, extensions, colours } = this.host;
    return runSettingsCommand(ctx, {
      settings,
      interactions,
      extensions,
      windows: () => this.host.windowLabels(),
      limitsChanged: () => {
        this.host.refreshLimits(ctx);
      },
      background: () => colours.background.value,
      iconsChanged: () => {
        settings.followSavedGlyphs();
        this.host.start(ctx);
      },
    });
  }
}
