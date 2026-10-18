import type { GitState } from '../core/model.js';
import { readGit, unknownGit } from './git.js';
import type { GitWatchLimits } from './git-inventory.js';
import { GitWatchSet } from './git-watch-set.js';
import {
  READ_INTERVAL_MS,
  TOPOLOGY_INTERVAL_MS,
  Throttle,
  coverageName,
  failureName,
  isCoverageFailure,
} from './git-coverage.js';
import { bootstrapWatches } from './git-bootstrap.js';
import type { GitWatchFactory } from './git-watch-set.js';

type GitHealth = 'initializing' | 'ready' | 'unknown' | 'unavailable';
export interface GitMonitorOptions {
  read?: (cwd: string, signal: AbortSignal) => Promise<GitState>;
  watch?: GitWatchFactory;
  maxWatches?: number;
  maxEntries?: number;
  /** Minimum time between two rescans of the watch topology. */
  topologyIntervalMs?: number;
  /** Minimum time between two status reads. */
  readIntervalMs?: number;
}

/** Native notifications and Pi hints wake one actor. No periodic/debounce/retry timer. */
export class GitMonitor {
  private pending = 0;
  private scheduled = false;
  private active: AbortController | undefined;
  private disposed = false;
  private ready = false;
  private value: GitState | undefined;
  private health: GitHealth = 'initializing';
  private failure: string | undefined;
  /** Watching could not cover this repository: refresh on request only. */
  private eventsOnly = false;
  private readonly rescans: Throttle;
  private readonly reads: Throttle;
  private readonly counts = {
    reads: 0,
    cycles: 0,
    rescans: 0,
    peakReads: 0,
    activeReads: 0,
    consumerErrors: 0,
  };
  private readonly read: NonNullable<GitMonitorOptions['read']>;
  private readonly limits: GitWatchLimits;
  private readonly watches: GitWatchSet;

  constructor(
    readonly cwd: string,
    private readonly publish: (state: GitState, health: GitHealth) => void,
    options: GitMonitorOptions = {},
  ) {
    this.read = options.read ?? readGit;
    this.rescans = new Throttle(options.topologyIntervalMs ?? TOPOLOGY_INTERVAL_MS, () => {
      this.request(true);
    });
    this.reads = new Throttle(options.readIntervalMs ?? READ_INTERVAL_MS, () => {
      this.request();
    });
    this.limits = {
      maxWatches: options.maxWatches ?? 2048,
      maxEntries: options.maxEntries ?? 100000,
    };
    for (const limit of Object.values(this.limits))
      if (!Number.isSafeInteger(limit) || limit < 1)
        throw new RangeError('Invalid Git watch budget');
    this.watches = new GitWatchSet(
      (topology) => {
        this.request(topology);
      },
      () => {
        this.watchFailed();
      },
      { limit: this.limits.maxWatches, ...(options.watch ? { open: options.watch } : {}) },
    );
    this.request(true);
  }

  request(topology = false): void {
    if (this.disposed) return;
    this.pending |= topology ? 3 : 1;
    if (this.active || this.scheduled) return;
    this.scheduled = true;
    queueMicrotask(() => {
      this.scheduled = false;
      this.run();
    });
  }
  private watchFailed(): void {
    this.failure = 'watcher-error';
    this.ready = false;
    this.pending = 0;
    this.active?.abort();
    this.accept(unknownGit, 'unavailable');
    // Recovery needs a new real/Pi/manual invalidation, never a self-retry loop.
  }
  private run(): void {
    if (this.disposed || this.active || !this.pending) return;
    if (!this.reads.allow()) return;
    const flags = this.rescanFlags(this.pending);
    this.pending = 0;
    const controller = new AbortController();
    this.active = controller;
    this.counts.cycles += 1;
    this.reconcile(flags, controller.signal)
      .catch((error: unknown) => {
        if (this.disposed || this.active !== controller) return;
        if (!controller.signal.aborted) this.failure = failureName(error);
        this.ready = false;
        this.accept(unknownGit, 'unavailable');
      })
      .finally(() => {
        if (this.active === controller) this.active = undefined;
        if (!this.disposed && this.pending) this.request(Boolean(this.pending & 2));
      })
      .catch(() => {
        /* Completion and subscriber failures cannot leak rejections. */
      });
  }
  /** The topology bit is dropped while the last rescan is too recent; one timer asks again. */
  private rescanFlags(flags: number): number {
    if (!(flags & 2) || !this.ready || this.eventsOnly) return flags;
    return this.rescans.allow() ? flags : flags & ~2;
  }
  /** Gives up watching (but not reading): every watcher closed, values still read on request. */
  private degrade(error: unknown): void {
    this.eventsOnly = true;
    this.ready = true;
    this.failure = coverageName(error);
    this.watches.retain(new Set());
  }
  private async watchOrDegrade(signal: AbortSignal): Promise<void> {
    try {
      await bootstrapWatches(this.cwd, this.watches, this.limits, signal);
      this.counts.rescans += 1;
      this.ready = true;
      this.rescans.mark();
    } catch (error) {
      if (signal.aborted || !isCoverageFailure(error)) throw error;
      this.degrade(error);
    }
  }
  private async reconcile(flags: number, signal: AbortSignal): Promise<void> {
    if (!this.eventsOnly && (flags & 2 || !this.ready)) await this.watchOrDegrade(signal);
    this.counts.reads += 1;
    this.counts.activeReads += 1;
    this.counts.peakReads = Math.max(this.counts.peakReads, this.counts.activeReads);
    let value: GitState;
    try {
      value = await this.read(this.cwd, signal);
    } finally {
      this.counts.activeReads -= 1;
    }
    signal.throwIfAborted();
    // Publish the completed observation even when more hints are queued; never await quiescence.
    if (!this.disposed)
      this.accept(this.observed(value), value.branch === null ? 'unknown' : 'ready');
  }
  private observed(value: GitState): GitState {
    return this.eventsOnly ? { ...value, monitoring: 'events' } : value;
  }
  private unchanged(value: GitState, health: GitHealth): boolean {
    const have = this.value;
    return (
      have?.branch === value.branch &&
      have.monitoring === value.monitoring &&
      have.changed === value.changed &&
      have.ahead === value.ahead &&
      this.health === health
    );
  }
  private accept(value: GitState, health: GitHealth): void {
    if (this.disposed || this.unchanged(value, health)) return;
    if (health === 'ready' && !this.eventsOnly) this.failure = undefined;
    if (health === 'unknown') this.failure = 'git-status-unavailable';
    const next: GitState =
      health === 'ready' ? { ...value } : { ...unknownGit, monitoring: 'unavailable' };
    try {
      this.publish({ ...next }, health);
      this.value = next;
      this.health = health;
    } catch {
      this.counts.consumerErrors += 1;
    }
  }
  stats() {
    return {
      ...this.counts,
      busy:
        this.active !== undefined ||
        this.scheduled ||
        this.pending !== 0 ||
        this.rescans.waiting ||
        this.reads.waiting,
      mode: this.eventsOnly ? 'events' : 'watching',
      watchers: this.watches.size,
      peakWatchers: this.watches.peak,
      events: this.watches.events,
      errors: this.watches.errors,
      health: this.health,
      failure: this.failure,
      limits: { ...this.limits },
    };
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pending = 0;
    this.rescans.stop();
    this.reads.stop();
    this.active?.abort();
    this.watches.close();
  }
}
