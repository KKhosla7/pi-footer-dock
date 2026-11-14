import { unknownGit } from './git.js';
import type { GitState } from '../core/model.js';
export const failures = new Map([
  ['Git watcher budget exceeded', 'watch-budget'],
  ['Git tracked directory budget exceeded', 'watch-budget'],
  ['Git inventory entry budget exceeded', 'inventory-budget'],
  ['Git inventory path budget exceeded', 'inventory-budget'],
  ['Unsupported Git include interpolation', 'unsupported-config'],
]);
const SYSTEM_LIMITS = new Set(['ENOSPC', 'EMFILE', 'ENFILE']);

export const isCoverageFailure = (error: unknown): boolean =>
  error instanceof Error &&
  (failures.has(error.message) || ('code' in error && SYSTEM_LIMITS.has(String(error.code))));

export const isNotRepository = (error: unknown): boolean =>
  error instanceof Error &&
  error.message === 'Git metadata query failed' &&
  error.cause instanceof Error &&
  'code' in error.cause &&
  error.cause.code === 128;

export const publishedState = (health: string, value: GitState): GitState =>
  health === 'ready'
    ? { ...value }
    : health === 'none'
      ? { ...unknownGit }
      : { ...unknownGit, monitoring: 'unavailable' };

export const failureName = (error: unknown): string =>
  (error instanceof Error ? failures.get(error.message) : undefined) ??
  (isNotRepository(error) ? 'not-repository' : 'source-unavailable');

export const coverageName = (error: unknown): string =>
  (error instanceof Error ? failures.get(error.message) : undefined) ?? 'watcher-unavailable';

export const TOPOLOGY_INTERVAL_MS = 1500;
export const READ_INTERVAL_MS = 250;

export class Throttle {
  private last = Number.NEGATIVE_INFINITY;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(
    private readonly interval: number,
    private readonly ask: () => void,
  ) {}
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
