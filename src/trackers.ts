import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { ExtensionBus } from './adapters/ext-bus.js';
import { GitTracker } from './adapters/git-tracker.js';
import { HistoryTracker } from './adapters/history/tracker.js';
import { QuotaController } from './quota-controller.js';

/** The sources the footer reads from, started and stopped together; each says when its data changed. */
export class Trackers {
  readonly git: GitTracker;
  readonly history: HistoryTracker;
  readonly extensions: ExtensionBus;
  readonly quotas: QuotaController;

  constructor(pi: ExtensionAPI, changed: () => void, limitsOn: () => boolean) {
    this.git = new GitTracker(changed);
    this.history = new HistoryTracker(changed);
    this.extensions = new ExtensionBus(pi, changed);
    this.quotas = new QuotaController(pi, changed, {}, limitsOn);
  }
  start(ctx: ExtensionContext): void {
    this.git.start(ctx.cwd);
    this.history.start(ctx);
    this.extensions.start();
    this.quotas.start(ctx);
  }
  /** The provider limits as last read, for the first snapshot of a session. */
  limits() {
    return this.quotas.snapshot().limits;
  }
  /** What `/dock-debug` reports about the sources. */
  diagnostics() {
    return { ...this.quotas.diagnostics(), gitMonitor: this.git.stats() };
  }
  stop(): void {
    this.quotas.stop();
    this.history.stop();
    this.extensions.stop();
    this.git.stop();
  }
}
