import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { TUI } from '@earendil-works/pi-tui';
import { NAMES } from './core/product.js';
import { InteractionTrace } from './core/interaction-trace.js';
import { ResponseTelemetry } from './adapters/response-telemetry.js';
import { DeferredRefresh } from './adapters/deferred-refresh.js';
import { diagnosticReport } from './adapters/diagnostics.js';
import type { QuotaController } from './quota-controller.js';
import { Trackers } from './trackers.js';
import { footerHost } from './footer-host.js';
import { RepaintClock } from './adapters/repaint-clock.js';
import { SessionSnapshotReader } from './adapters/session-usage.js';
import type { Snapshot } from './core/model.js';
import { loadSettings, saveSettings } from './adapters/settings-file.js';
import { FooterInteractions } from './footer-interactions.js';
import { SettingsController } from './settings-controller.js';
import { runSettingsCommand } from './settings-command.js';
import type { SettingsStore } from './settings-controller.js';
import { DockFooter } from './ui/footer.js';
import { createPaint } from './ui/palette.js';
import { say } from './notify.js';

export class DockRuntime {
  private ctx: ExtensionContext | undefined;
  private tui: TUI | undefined;
  private live: Snapshot | undefined;
  /** What the trackers call when their data changed: draw again from the latest snapshot. */
  private readonly changed = (): void => {
    if (this.ctx) this.refresh(this.ctx);
  };
  readonly settings: SettingsController;
  private footerRevision = 0;
  private readonly trackers: Trackers;
  private readonly clock = new RepaintClock();
  private readonly deferredRefresh = new DeferredRefresh();
  readonly telemetry = new ResponseTelemetry();
  private readonly usage = new SessionSnapshotReader();
  readonly pointerTrace = new InteractionTrace((record) => {
    this.pi.events.emit(NAMES.traceChannel, record);
  });
  readonly interactions: FooterInteractions;
  constructor(
    private readonly pi: ExtensionAPI,
    settingsStore: SettingsStore = { load: loadSettings, save: saveSettings },
  ) {
    this.settings = new SettingsController(settingsStore);
    this.trackers = new Trackers(pi, this.changed, () => this.settings.current.limits === 'on');
    this.pointerTrace.enabled = process.env[NAMES.pointerDebugEnv] === '1';
    this.interactions = new FooterInteractions(
      pi,
      () => this.snapshot(),
      this.pointerTrace.record,
      footerHost(() => this.tui, this.settings, this.trackers.extensions),
    );
  }

  start(ctx: ExtensionContext): void {
    this.stop();
    if (ctx.mode !== 'tui') return;
    ctx.ui.setFooter(undefined);
    this.settings.load((message) => {
      say(ctx, message, 'warning');
    });
    this.ctx = ctx;
    this.trackers.start(ctx);
    this.live = this.usage.capture(
      ctx,
      this.pi,
      this.trackers.git.state,
      this.trackers.quotas.snapshot().limits,
    );
    this.installFooter(ctx);
    this.interactions.start(ctx);
    this.clock.start(() => this.tui?.requestRender());
    this.refreshQuotas(ctx);
  }

  private installFooter(ctx: ExtensionContext): void {
    ctx.ui.setFooter((tui, theme, footerData) => {
      const revision = ++this.footerRevision;
      this.tui = tui;
      this.trackers.quotas.resume();
      const unsubscribe = footerData.onBranchChange(() => {
        this.refreshGit();
      });
      return new DockFooter({
        paint: createPaint(theme),
        requestRender: tui.requestRender.bind(tui),
        statuses: () => footerData.getExtensionStatuses(),
        glyphs: this.settings.glyphs,
        snapshot: () => this.snapshot(),
        ...this.interactions.bindings(),
        trace: this.pointerTrace.record,
        traceEnabled: () => this.pointerTrace.enabled,
        onActivate: (target) => {
          if (this.ctx) {
            const ctx = this.ctx;
            this.interactions.activate(target, ctx).catch((error: unknown) => {
              this.notifyError(ctx, error);
            });
          }
        },
        dispose: () => {
          unsubscribe();
          this.detachFooter(revision);
        },
      });
    });
  }

  private detachFooter(revision: number): void {
    if (revision !== this.footerRevision) return;
    this.tui = undefined;
    this.trackers.quotas.pause();
    this.deferredRefresh.cancel();
    setImmediate(() => {
      if (revision === this.footerRevision && !this.tui) this.stop();
    });
  }

  /** The quota controller while a session is bound; provider traffic is ignored otherwise. */
  quotaFeed(): QuotaController | undefined {
    return this.ctx ? this.trackers.quotas : undefined;
  }

  refresh(ctx: ExtensionContext): void {
    if (!this.ctx || !this.tui || ctx.mode !== 'tui') return;
    this.ctx = ctx;
    if (this.trackers.git.moved(ctx.cwd)) this.refreshGit();
    this.trackers.quotas.updateContext(ctx);
    const state = this.trackers.quotas.snapshot();
    const snapshot = this.usage.capture(ctx, this.pi, this.trackers.git.state, state.limits);
    this.live = {
      ...snapshot,
      ...this.trackers.history.fields(ctx, snapshot),
      ...this.telemetry.snapshot(ctx.model?.promptCache),
      quotaStatus: state.status ?? snapshot.quotaStatus ?? null,
      ...(state.freshness ? { quotaFreshness: state.freshness } : {}),
    };
    this.tui.requestRender();
  }

  refreshHistory(ctx: ExtensionContext, resetTelemetry = false): void {
    if (resetTelemetry) this.telemetry.reset();
    this.usage.invalidate();
    this.refresh(ctx);
  }

  refreshQuotas(ctx: ExtensionContext): void {
    if (this.ctx) this.trackers.quotas.refresh(ctx);
  }

  modelChanged(ctx: ExtensionContext): void {
    this.telemetry.reset();
    this.refresh(ctx);
    this.refreshQuotas(ctx);
  }

  refreshAfterPersistence(ctx: ExtensionContext): void {
    if (!this.ctx || ctx.mode !== 'tui') return;
    this.trackers.history.sessionGrew(ctx);
    this.deferredRefresh.schedule(() => {
      try {
        this.refresh(ctx);
      } catch (error) {
        this.notifyError(ctx, error);
      }
    });
  }

  refreshGit(): void {
    if (this.ctx) this.trackers.git.refresh(this.ctx.cwd);
  }

  diagnostics(ctx: ExtensionContext): string {
    return diagnosticReport({
      command: ctx,
      bound: this.ctx,
      cached: this.live,
      source: import.meta.url,
      ...this.trackers.quotas.diagnostics(),
      gitMonitor: this.trackers.git.stats(),
      footerSlots: this.interactions.config.rows.flatMap((row) => [...row.left, ...row.right]),
    });
  }

  contextAction(ctx: ExtensionContext): Promise<void> {
    return this.interactions.invokeTarget('context', ctx).catch((error: unknown) => {
      this.notifyError(ctx, error);
    });
  }

  toggleGlyphs(ctx: ExtensionContext): void {
    this.settings.toggleGlyphs();
    this.start(ctx);
  }

  openSettings(ctx: ExtensionContext): Promise<void> {
    return runSettingsCommand(ctx, {
      settings: this.settings,
      interactions: this.interactions,
      extensions: this.trackers.extensions,
      windows: () => (this.snapshot().rateLimits?.windows ?? []).map((window) => window.label),
      limitsChanged: () => {
        this.trackers.quotas.refresh(ctx);
      },
      iconsChanged: () => {
        this.settings.followSavedGlyphs();
        this.start(ctx);
      },
    });
  }

  stop(): void {
    this.footerRevision += 1;
    this.trackers.stop();
    this.telemetry.reset();
    this.usage.reset();
    this.interactions.stop();
    this.deferredRefresh.cancel();
    this.clock.stop();
    this.ctx = undefined;
    this.tui = undefined;
    this.live = undefined;
  }

  private snapshot(): Snapshot {
    if (!this.live) throw new Error('Footer Dock footer rendered outside its session lifecycle');
    return this.live;
  }

  private notifyError(ctx: ExtensionContext, error: unknown): void {
    if (this.ctx !== ctx || !this.tui) return;
    say(ctx, error instanceof Error ? error.message : 'Footer Dock refresh failed', 'error');
  }
}
