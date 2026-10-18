import { randomUUID } from 'node:crypto';
import { lstat, mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { admits, finishedState, parseGateState, reservedState } from './gate-state.js';
import type { GateResult, GateState } from './gate-state.js';

export type { GateObservation, GateResult, GateState } from './gate-state.js';
export interface GateOptions {
  root: string;
  now?: () => number;
  flightMs?: number;
  lockStaleMs?: number;
}

const MAX_FILE_BYTES = 16_384;
const LOCK_WAIT_MS = 1500;

function codeOf(error: unknown): unknown {
  return error instanceof Error && 'code' in error ? error.code : undefined;
}
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return codeOf(error) === 'EPERM';
  }
}

/**
 * Portable cross-process admission: one request per scope per interval, for every Pi window of
 * this OS user. Private directory, atomic replace and a pid-stamped lock file; no database.
 */
export class SharedGate {
  private readonly now: () => number;
  private readonly flightMs: number;
  private readonly lockStaleMs: number;
  private checked = false;

  constructor(private readonly options: GateOptions) {
    this.now = options.now ?? Date.now;
    this.flightMs = options.flightMs ?? 45_000;
    this.lockStaleMs = options.lockStaleMs ?? 10_000;
  }

  async view(scope: string): Promise<GateState | undefined> {
    this.file(scope);
    await this.ready();
    return this.load(scope);
  }

  /** Admits at most one caller per interval; everyone else only reads the shared state. */
  async reserve(scope: string, minIntervalMs: number): Promise<{ revision: string } | undefined> {
    await this.ready();
    return this.withLock(scope, async () => {
      const now = this.now();
      const state = await this.load(scope);
      if (!admits(state, now, this.flightMs)) return undefined;
      const revision = randomUUID();
      await this.store(
        scope,
        reservedState(state, now, { revision, minIntervalMs, flightMs: this.flightMs }),
      );
      return { revision };
    });
  }

  /** Records the outcome; ignored if another caller took over after this flight expired. */
  async finish(scope: string, revision: string, result: GateResult): Promise<boolean> {
    await this.ready();
    const done = await this.withLock(scope, async () => {
      const state = await this.load(scope);
      if (state?.revision !== revision) return false;
      await this.store(scope, finishedState(state, this.now(), result));
      return true;
    });
    return done ?? false;
  }

  private file(scope: string): string {
    if (!/^[a-f0-9]{64}$/u.test(scope)) throw new Error('Invalid quota scope');
    return join(this.options.root, `${scope}.json`);
  }
  private async ready(): Promise<void> {
    if (this.checked) return;
    await mkdir(this.options.root, { recursive: true, mode: 0o700 });
    const info = await lstat(this.options.root);
    const owner = process.getuid?.();
    const posix = process.platform !== 'win32';
    if (
      !info.isDirectory() ||
      info.isSymbolicLink() ||
      (posix && owner !== undefined && info.uid !== owner) ||
      (posix && (info.mode & 0o077) !== 0)
    )
      throw new Error('Unsafe quota directory');
    this.checked = true;
  }
  private async load(scope: string): Promise<GateState | undefined> {
    try {
      const file = this.file(scope);
      const info = await stat(file);
      return info.isFile() && info.size <= MAX_FILE_BYTES
        ? parseGateState(await readFile(file, 'utf8'))
        : undefined;
    } catch {
      return undefined;
    }
  }
  private async store(scope: string, state: GateState): Promise<void> {
    const file = this.file(scope);
    const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, JSON.stringify(state), { mode: 0o600, flag: 'wx' });
      await rename(temporary, file);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
  }
  private async withLock<T>(scope: string, run: () => Promise<T>): Promise<T | undefined> {
    const lock = `${this.file(scope)}.lock`;
    const deadline = Date.now() + LOCK_WAIT_MS;
    for (let attempt = 0; !(await this.acquire(lock)); attempt += 1) {
      if (Date.now() >= deadline) return undefined;
      await delay(10 + Math.min(40, attempt * 5));
    }
    try {
      return await run();
    } finally {
      await rm(lock, { force: true });
    }
  }
  private async acquire(lock: string): Promise<boolean> {
    try {
      const handle = await open(lock, 'wx', 0o600);
      try {
        await handle.writeFile(`${process.pid}:${Date.now()}`);
      } finally {
        await handle.close();
      }
      return true;
    } catch (error) {
      if (codeOf(error) !== 'EEXIST') throw error;
      await this.clearStale(lock);
      return false;
    }
  }
  /** A lock is stale if its holder is gone, or if it is past its lifetime. */
  private async clearStale(lock: string): Promise<void> {
    try {
      const info = await stat(lock);
      const [pid, at] = (await readFile(lock, 'utf8')).split(':').map(Number);
      const holderGone = pid !== undefined && Number.isInteger(pid) && pid > 0 && !alive(pid);
      const stamped = at !== undefined && Number.isFinite(at) ? at : info.mtimeMs;
      if (holderGone || Date.now() - stamped > this.lockStaleMs) await rm(lock, { force: true });
    } catch {
      /* The holder released it meanwhile. */
    }
  }
}
