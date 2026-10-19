import { unknownGit } from './git.js';
import type { GitState } from '../core/model.js';
/** Failures of the watch set, by the message that reports them, and what they are called in stats. */
export const failures = new Map([
  ['Git watcher budget exceeded', 'watch-budget'],
  ['Git tracked directory budget exceeded', 'watch-budget'],
  ['Git inventory entry budget exceeded', 'inventory-budget'],
  ['Git inventory path budget exceeded', 'inventory-budget'],
  ['Unsupported Git include interpolation', 'unsupported-config'],
]);
const SYSTEM_LIMITS = new Set(['ENOSPC', 'EMFILE', 'ENFILE']);

/** Whether watching cannot cover this repository (so Git is read on request only), not that Git failed. */
export const isCoverageFailure = (error: unknown): boolean =>
  error instanceof Error &&
  (failures.has(error.message) || ('code' in error && SYSTEM_LIMITS.has(String(error.code))));

/** The folder is not inside a Git repository (Git answers with exit code 128): nothing to show, nothing wrong. */
export const isNotRepository = (error: unknown): boolean =>
  error instanceof Error &&
  error.message === 'Git metadata query failed' &&
  error.cause instanceof Error &&
  'code' in error.cause &&
  error.cause.code === 128;

/** What is published for a health: the value when read, nothing for a folder without Git, "unavailable" otherwise. */
export const publishedState = (health: string, value: GitState): GitState =>
  health === 'ready'
    ? { ...value }
    : health === 'none'
      ? { ...unknownGit }
      : { ...unknownGit, monitoring: 'unavailable' };

/** What any monitor failure is called in the statistics. */
export const failureName = (error: unknown): string =>
  (error instanceof Error ? failures.get(error.message) : undefined) ??
  (isNotRepository(error) ? 'not-repository' : 'source-unavailable');

/** What a coverage failure is called in the monitor's statistics. */
export const coverageName = (error: unknown): string =>
  (error instanceof Error ? failures.get(error.message) : undefined) ?? 'watcher-unavailable';

/** Topology rescans (rebuilding the watch set) at most this often, whatever the writes. */
export const TOPOLOGY_INTERVAL_MS = 1500;
/** Status reads at most this often: a build writing files all the time must not run Git all the time. */
export const READ_INTERVAL_MS = 250;

/** At most one start per interval; what arrives in between is answered by one trailing request. */
export class Throttle {
  private last = Number.NEGATIVE_INFINITY;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private readonly interval: number,
    private readonly ask: () => void,
  ) {}
  /** True to run now (counted as a start); false when too soon, after arming the one timer that asks again. */
  allow(): boolean {
    const wait = this.last + this.interval - Date.now();
    if (wait <= 0) {
      this.last = Date.now();
      return true;
    }
    this.timer ??= setTimeout(() => {
      this.timer = undefined;
      this.ask();
    }, wait);
    this.timer.unref();
    return false;
  }
  /** Counts a start that was not asked of `allow` (the first rescan, at start). */
  mark(): void {
    this.last = Date.now();
  }
  get waiting(): boolean {
    return this.timer !== undefined;
  }
  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
}
