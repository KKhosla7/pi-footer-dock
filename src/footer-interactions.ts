import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { PROBLEM_MARKER, QUOTA_TOGGLE, clickMode, slotOptions } from './core/footer-config.js';
import type { FooterConfig } from './core/footer-config.js';
import { UIActionRegistry } from './core/ui-actions.js';
import type { Settings } from './core/settings.js';
import type { InteractionHost } from './footer-host.js';
import type { Found } from './core/ext/registry.js';
import { createIconActions } from './click-actions.js';
import { ExplainPresenter } from './explain-presenter.js';
import { ScreenToggle } from './ui/screen-toggle.js';
import { SessionConfig } from './session-config.js';
import type { ProblemsHost } from './problems-controller.js';
import { iconTarget, parseTarget } from './core/click-targets.js';
import type { Snapshot } from './core/model.js';
import { say } from './notify.js';

type Trace = (record: Record<string, unknown>) => void;

export class FooterInteractions {
  private readonly session: SessionConfig;
  quotaExpanded = false;
  private lastOpen = 0;
  private readonly screens = new ScreenToggle();
  private readonly actions: UIActionRegistry;
  private readonly iconActions: ReturnType<typeof createIconActions>;
  private readonly explainer = new ExplainPresenter({
    config: () => this.config,
    snapshot: () => this.snapshot(),
    glyphs: () => this.display.glyphs(),
    extensions: () => this.display.extensions.registry,
  });

  constructor(
    pi: ExtensionAPI,
    private readonly snapshot: () => Snapshot,
    private readonly trace: Trace,
    private readonly display: InteractionHost,
  ) {
    this.session = new SessionConfig(
      pi,
      () => display.settings(),
      () => {
        this.actions.start();
        display.redraw();
      },
    );
    this.actions = new UIActionRegistry(pi.events, this.session.targets, trace);
    this.iconActions = createIconActions(pi);
  }
  get problems(): ProblemsHost {
    return this.display.problems;
  }
  get config(): FooterConfig {
    return this.session.config;
  }
  start(ctx: ExtensionContext): void {
    this.session.restore(ctx);
    this.quotaExpanded = this.display.settings().quotaExpanded === true;
    this.actions.start();
  }
  stop(): void {
    this.actions.stop();
  }
  interactive(target: string): boolean {
    return clickMode(this.config, parseTarget(target).id) !== 'none';
  }

  bindings() {
    return {
      configuration: () => this.config,
      isInteractive: (target: string) => this.interactive(target),
      isQuotaExpanded: () => this.quotaExpanded,
      problemState: () => this.display.problems.state,
      extensions: this.display.extensions.registry,
    };
  }
  settingsChanged(before: Settings): void {
    const now = this.display.settings();
    this.session.reapply();
    if (now.quotaExpanded !== before.quotaExpanded) this.quotaExpanded = now.quotaExpanded === true;
    this.display.redraw();
  }
  private async act(id: string, ctx: ExtensionContext): Promise<boolean> {
    if (this.display.settings().clicks === 'explain') return false;
    if (id === 'workspace') {
      await this.openFolder(ctx);
      return true;
    }
    const action = this.iconActions.get(id);
    if (!action) return false;
    await this.screens.toggle(iconTarget(id), action, ctx);
    return true;
  }
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

  async activate(target: string, ctx: ExtensionContext): Promise<void> {
    const { id, icon } = parseTarget(target);
    if (ctx.mode !== 'tui') return;
    if (id === QUOTA_TOGGLE) {
      this.toggleQuota();
      return;
    }
    if (id === PROBLEM_MARKER)
      return this.screens.toggle(target, () => this.display.problems.open(ctx), ctx);
    const external = this.display.extensions.registry.find(id);
    if (external) return this.activateExternal(external, { icon, target }, ctx);
    if (icon && (await this.act(id, ctx))) return;
    this.trace({ layer: 'runtime', event: 'slot-activation', target: id, source: 'mouse' });
    if (clickMode(this.config, id) === 'action') {
      const target = slotOptions(this.config, id).actionTarget ?? id;
      const result = await this.invoke(target, ctx, 'mouse');
      if (result !== 'unavailable') return;
    }
    await this.screens.toggle(target, () => this.explainer.screen(id, ctx), ctx);
  }
  private async activateExternal(
    { registration, item }: Found,
    click: { icon: boolean; target: string },
    ctx: ExtensionContext,
  ): Promise<void> {
    const token = click.icon && item.icon === 'event' ? 'icon' : 'text';
    const behaviour = token === 'icon' ? 'event' : item.text;
    if (behaviour === 'event') this.display.extensions.click(registration.ext, item.id, token);
    else if (behaviour === 'explain')
      await this.screens.toggle(
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
  explain(id: string, ctx: ExtensionContext): void {
    this.explainer.notice(id, ctx);
  }
  async info(args: string, ctx: ExtensionContext): Promise<void> {
    const ids = this.config.rows.flatMap((row) => [...row.left, ...row.right]);
    const id = args.trim() || (await ctx.ui.select('Explain footer value', ids));
    if (id) this.explain(id, ctx);
  }
  configure(args: string, ctx: ExtensionContext): void {
    this.session.configure(args, ctx);
  }
}
