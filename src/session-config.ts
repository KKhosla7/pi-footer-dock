import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { actionTargets, defaultFooterConfig, parseFooterConfig } from './core/footer-config.js';
import type { FooterConfig } from './core/footer-config.js';
import { explainConfig } from './core/config-command.js';
import { NAMES } from './core/product.js';
import { applySettings } from './core/settings.js';
import type { Settings } from './core/settings.js';
import { say } from './notify.js';

const CONFIG_ENTRY = NAMES.configEntry;

export class SessionConfig {
  config = defaultFooterConfig();
  private base = this.config;
  readonly targets = actionTargets(this.config);

  constructor(
    private readonly pi: ExtensionAPI,
    private readonly settings: () => Settings,
    private readonly changed: () => void,
  ) {}

  restore(ctx: ExtensionContext): void {
    this.base = this.saved(ctx);
    this.reapply();
    this.updateTargets();
  }
  reapply(): void {
    this.config = applySettings(this.base, this.settings());
  }
  configure(args: string, ctx: ExtensionContext): void {
    if (ctx.mode !== 'tui') return;
    if (!args.trim() || args.trim() === 'show') {
      say(ctx, JSON.stringify(this.config, null, 2), 'info');
      return;
    }
    try {
      if (args.length > 16_384) throw new Error('Config too large');
      const value: unknown = args.trim() === 'reset' ? defaultFooterConfig() : JSON.parse(args);
      const next = parseFooterConfig(value);
      this.pi.appendEntry(CONFIG_ENTRY, next);
      this.base = next;
      this.reapply();
      this.updateTargets();
      this.changed();
      say(ctx, 'Footer configuration saved for this session.', 'info');
    } catch {
      say(ctx, explainConfig(args), 'error');
    }
  }
  private updateTargets(): void {
    this.targets.clear();
    this.targets.add('context');
    for (const target of actionTargets(this.config)) this.targets.add(target);
  }
  private saved(ctx: ExtensionContext): FooterConfig {
    const entries = ctx.sessionManager.getBranch();
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      const entry = entries[index];
      if (entry?.type !== 'custom') continue;
      if (
        entry.customType !== CONFIG_ENTRY &&
        !(NAMES.legacyConfigEntries as readonly string[]).includes(entry.customType)
      )
        continue;
      try {
        return parseFooterConfig(entry.data);
      } catch {}
    }
    return defaultFooterConfig();
  }
}
