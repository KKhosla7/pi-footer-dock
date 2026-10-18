import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import {
  QUOTA_TOGGLE,
  actionTargets,
  clickMode,
  defaultFooterConfig,
  parseFooterConfig,
  slotOptions,
} from './core/footer-config.js';
import type { FooterConfig } from './core/footer-config.js';
import { UIActionRegistry } from './core/ui-actions.js';
import { applySettings } from './core/settings.js';
import type { Settings } from './core/settings.js';
import type { ExtensionBus } from './adapters/ext-bus.js';
import type { Found } from './core/ext/registry.js';
import type { OpenResult } from './adapters/folder-opener.js';
import { createIconActions } from './click-actions.js';
import { ExplainPresenter } from './explain-presenter.js';
import { closeInfoScreen } from './ui/info-screen.js';
import { NAMES } from './core/product.js';
import { iconTarget, parseTarget } from './core/click-targets.js';
import type { Snapshot } from './core/model.js';
import type { Glyphs } from './ui/glyphs.js';
import { say } from './notify.js';

const CONFIG_ENTRY = NAMES.configEntry;
type Trace = (record: Record<string, unknown>) => void;

/** Shared interaction/configuration controller; no provider package IDs or commands. */
export class FooterInteractions {
  /** What the footer uses: the session configuration with the global settings applied. */
  config = defaultFooterConfig();
  private base = this.config;
  /** Whether the quota shows every window when the footer is narrow; per session, not saved. */
  quotaExpanded = false;
  private lastOpen = 0;
  /** The item whose screen is open now. */
  private screenOpen: string | undefined;
  private readonly targets = actionTargets(this.config);
  private readonly actions: UIActionRegistry;
  private readonly iconActions: ReturnType<typeof createIconActions>;
  private readonly explainer = new ExplainPresenter({
    config: () => this.config,
    snapshot: () => this.snapshot(),
    glyphs: () => this.display.glyphs(),
    extensions: () => this.display.extensions.registry,
  });

  constructor(
    private readonly pi: ExtensionAPI,
    private readonly snapshot: () => Snapshot,
    private readonly trace: Trace,
    private readonly display: {
      redraw: () => void;
      glyphs: () => Glyphs;
      settings: () => Settings;
      openFolder: (directory: string) => Promise<OpenResult>;
      extensions: ExtensionBus;
    },
  ) {
    this.actions = new UIActionRegistry(pi.events, this.targets, trace);
    this.iconActions = createIconActions(pi);
  }
  start(ctx: ExtensionContext): void {
    this.base = this.restore(ctx);
    this.config = applySettings(this.base, this.display.settings());
    this.quotaExpanded = this.display.settings().quotaExpanded === true;
    this.updateTargets();
    this.actions.start();
  }
  stop(): void {
    this.actions.stop();
  }
  interactive(target: string): boolean {
    return clickMode(this.config, parseTarget(target).id) !== 'none';
  }

  /** What the footer component needs to read from here on every draw. */
  bindings() {
    return {
      configuration: () => this.config,
      isInteractive: (target: string) => this.interactive(target),
      isQuotaExpanded: () => this.quotaExpanded,
      extensions: this.display.extensions.registry,
    };
  }
  /** The global settings changed (from the menu): re-apply them to the live footer. */
  settingsChanged(before: Settings): void {
    const now = this.display.settings();
    this.config = applySettings(this.base, now);
    if (now.quotaExpanded !== before.quotaExpanded) this.quotaExpanded = now.quotaExpanded === true;
    this.display.redraw();
  }
  /** What a click does besides explaining; false when the item has no action or clicks only explain. */
  private async act(id: string, ctx: ExtensionContext): Promise<boolean> {
    if (this.display.settings().clicks === 'explain') return false;
    if (id === 'workspace') {
      await this.openFolder(ctx);
      return true;
    }
    const action = this.iconActions.get(id);
    if (!action) return false;
    await this.toggleScreen(iconTarget(id), action, ctx);
    return true;
  }
  /** A click target opens its screen; the same target again closes it; another one switches. */
  private async toggleScreen(
    key: string,
    action: (ctx: ExtensionContext) => Promise<void>,
    ctx: ExtensionContext,
  ): Promise<void> {
    const wasOpen = this.screenOpen;
    if (wasOpen !== undefined) closeInfoScreen();
    if (wasOpen === key) return;
    this.screenOpen = key;
    try {
      await action(ctx);
    } finally {
      if (this.screenOpen === key) this.screenOpen = undefined;
    }
  }
  /** Opens the project folder in the file manager (or the user's app); at most once a second. */
  async openFolder(ctx: ExtensionContext): Promise<void> {
    if (ctx.mode !== 'tui' || Date.now() - this.lastOpen < 1000) return;
    this.lastOpen = Date.now();
    const result = await this.display.openFolder(ctx.cwd);
    if (!result.ok) say(ctx, result.message, 'warning');
  }
  toggleQuota(): void {
    this.quotaExpanded = !this.quotaExpanded;
    this.display.redraw();
  }

  /** A click on a token of an item: its icon may act (open, pick); its text explains. */
  async activate(target: string, ctx: ExtensionContext): Promise<void> {
    const { id, icon } = parseTarget(target);
    if (ctx.mode !== 'tui') return;
    if (id === QUOTA_TOGGLE) {
      this.toggleQuota();
      return;
    }
    const external = this.display.extensions.registry.find(id);
    if (external) return this.activateExternal(external, { icon, target }, ctx);
    if (icon && (await this.act(id, ctx))) return;
    this.trace({ layer: 'runtime', event: 'slot-activation', target: id, source: 'mouse' });
    if (clickMode(this.config, id) === 'action') {
      const target = slotOptions(this.config, id).actionTarget ?? id;
      const result = await this.invoke(target, ctx, 'mouse');
      if (result !== 'unavailable') return;
    }
    await this.toggleScreen(target, () => this.explainer.screen(id, ctx), ctx);
  }
  /** A click on an extension's item: an event for it, or Footer Dock's explanation of it, as it declared. */
  private async activateExternal(
    { registration, item }: Found,
    click: { icon: boolean; target: string },
    ctx: ExtensionContext,
  ): Promise<void> {
    const token = click.icon && item.icon === 'event' ? 'icon' : 'text';
    const behaviour = token === 'icon' ? 'event' : item.text;
    if (behaviour === 'event') this.display.extensions.click(registration.ext, item.id, token);
    else if (behaviour === 'explain')
      await this.toggleScreen(
        click.target,
        () => this.explainer.screen(`${registration.ext}:${item.id}`, ctx),
        ctx,
      );
  }
  async invokeTarget(target: string, ctx: ExtensionContext): Promise<void> {
    if (ctx.mode !== 'tui') return;
    const result = await this.invoke(target, ctx, 'keyboard');
    if (result === 'unavailable') say(ctx, `No ${target} action is currently registered.`, 'info');
  }
  private async invoke(target: string, ctx: ExtensionContext, source: string) {
    this.trace({ layer: 'runtime', event: 'action-request', target, source });
    const result = await this.actions.invoke(target, (labels) =>
      ctx.ui.select('Footer actions', labels),
    );
    this.trace({ layer: 'runtime', event: 'action-result', result });
    return result;
  }
  /** The explanation as a notice: the keyboard path, `/dock-info`. */
  explain(id: string, ctx: ExtensionContext): void {
    this.explainer.notice(id, ctx);
  }
  async info(args: string, ctx: ExtensionContext): Promise<void> {
    const ids = this.config.rows.flatMap((row) => [...row.left, ...row.right]);
    const id = args.trim() || (await ctx.ui.select('Explain footer value', ids));
    if (id) this.explain(id, ctx);
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
      this.config = applySettings(next, this.display.settings());
      this.updateTargets();
      this.actions.start();
      this.display.redraw();
      say(ctx, 'Footer configuration saved for this session.', 'info');
    } catch {
      say(ctx, 'Invalid footer configuration (two rows, unique slots). Nothing changed.', 'error');
    }
  }
  private updateTargets(): void {
    this.targets.clear();
    this.targets.add('context'); // Existing keyboard command remains available even when its icon is hidden.
    for (const target of actionTargets(this.config)) this.targets.add(target);
  }
  private restore(ctx: ExtensionContext): FooterConfig {
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
      } catch {
        /* Ignore invalid historic preferences. */
      }
    }
    return defaultFooterConfig();
  }
}
