import type { Component, TuiMouseEvent, TuiMouseEventResult } from '@earendil-works/pi-tui';
import type { Snapshot } from '../core/model.js';
import type { HitRegion, LayoutOptions } from './layout.js';
import { layoutFooter } from './layout.js';
import { hitRegion, pointerRejection } from './pointer.js';
import type { FooterConfig } from '../core/footer-config.js';
import { ProblemBlink } from './problem-blink.js';
import { QuotaAnimation } from './quota-animation.js';
import { statusLine } from './statuses.js';

export interface FooterOptions extends LayoutOptions {
  snapshot: () => Snapshot;
  dispose: () => void;
  isInteractive?: (target: string) => boolean;
  isQuotaExpanded?: () => boolean;
  /** Configuration problems and whether the user has looked at them; absent or empty means none. */
  problemState?: () => { count: number; alerting: boolean };
  onActivate?: (target: string) => void;
  configuration?: () => FooterConfig;
  trace?: (metadata: Record<string, unknown>) => void;
  traceEnabled?: () => boolean;
  requestRender?: () => void;
  /** What other extensions set with `ctx.ui.setStatus`: shown on a last line, as Pi's own footer does. */
  statuses?: () => ReadonlyMap<string, string>;
}

/** Footer-only component: owns neither a context widget nor editor input. */
export class DockFooter implements Component {
  private regions: HitRegion[] = [];
  private renderedWidth = -1;
  private disposed = false;
  private renderVersion = 0;

  private readonly animation: QuotaAnimation;
  private readonly blink: ProblemBlink;

  constructor(private readonly options: FooterOptions) {
    this.animation = new QuotaAnimation(() => this.options.requestRender?.());
    this.blink = new ProblemBlink(() => this.options.requestRender?.());
  }

  private layoutOptions(
    config: FooterConfig | undefined,
    problems: { count: number } | undefined,
  ): LayoutOptions {
    return {
      ...this.options,
      quotaFrame: this.animation.frame,
      ...(problems && problems.count > 0
        ? { problems: { count: problems.count, bright: this.blink.bright } }
        : {}),
      quotaExpanded: this.options.isQuotaExpanded?.() ?? false,
      ...(config ? { config } : {}),
    };
  }

  /** The quota's highlight and the problem marker's blink: both follow the animation setting. */
  private animate(
    snapshot: Snapshot,
    config: FooterConfig | undefined,
    problems: { alerting: boolean } | undefined,
  ): void {
    const enabled =
      !this.disposed && !!this.options.requestRender && config?.slots.quota?.animation !== false;
    this.animation.update(snapshot, enabled);
    this.blink.update(!!problems?.alerting && enabled);
  }

  render(width: number): string[] {
    const snapshot = this.options.snapshot();
    const config = this.options.configuration?.();
    const problems = this.options.problemState?.();
    this.animate(snapshot, config, problems);
    const layout = layoutFooter(snapshot, width, this.layoutOptions(config, problems));
    const regions = this.disposed ? [] : layout.hitRegions;
    const nextWidth = Math.max(0, Math.floor(width));
    const changed =
      this.tracing() &&
      (nextWidth !== this.renderedWidth ||
        JSON.stringify(regions) !== JSON.stringify(this.regions));
    this.regions = regions;
    this.renderedWidth = nextWidth;
    this.renderVersion += 1;
    // Trace only geometry changes: diagnostics must not create a render/log feedback loop.
    if (changed)
      this.options.trace?.({
        layer: 'footer',
        event: 'geometry',
        width: this.renderedWidth,
        regions: this.regions.map((region) => ({ ...region })),
      });
    return this.withStatuses(layout.lines, width);
  }

  private withStatuses(lines: string[], width: number): string[] {
    const others = statusLine(this.options.statuses?.() ?? new Map(), width);
    return others === undefined ? lines : [...lines, others];
  }

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    const region = hitRegion(event, this.regions);
    const reason = this.rejection(event, region);
    if (this.tracing())
      this.options.trace?.({
        layer: 'footer',
        event: event.type,
        button: event.button,
        x: event.x,
        y: event.y,
        screenX: event.screenX,
        screenY: event.screenY,
        originX: event.screenX - event.x,
        originY: event.screenY - event.y,
        width: event.width,
        height: event.height,
        renderedWidth: this.renderedWidth,
        renderVersion: this.renderVersion,
        regions: this.regions.map((region) => ({ ...region })),
        clickCount: event.clickCount,
        target: region?.target,
        available: region ? (this.options.isInteractive?.(region.target) ?? false) : false,
        reason: reason ?? 'handled',
      });
    if (reason) return undefined;
    // Pi retains a handled press target and emits click on a matching release.
    // Reserve only configured interactive spans; activation happens exclusively on click.
    if (event.type === 'click' && region) this.options.onActivate?.(region.target);
    return { handled: true, render: false };
  }

  private tracing(): boolean {
    return !!this.options.trace && this.options.traceEnabled?.() !== false;
  }

  private rejection(event: TuiMouseEvent, region: HitRegion | undefined): string | undefined {
    if (this.disposed) return 'disposed';
    if (event.width !== this.renderedWidth) return 'stale-width-or-invalidated';
    const rejected = pointerRejection(event);
    if (rejected) return rejected;
    if (!region) return 'outside-target';
    if (!this.options.onActivate || !this.options.isInteractive?.(region.target))
      return 'action-unavailable';
    return undefined;
  }

  invalidate(): void {
    if (this.tracing())
      this.options.trace?.({ layer: 'footer', event: 'invalidate', width: this.renderedWidth });
    this.regions = [];
    this.renderedWidth = -1;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.animation.stop();
    this.blink.stop();
    this.invalidate();
    this.options.dispose();
  }
}
