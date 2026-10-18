import { watch } from 'node:fs';

export type GitWatchFilter = (filename: string | undefined) => boolean;
export type GitWatchKind = 'work' | 'meta';
export type GitWatchListener = (event: 'rename' | 'change', filename: string | null) => void;
export interface GitWatchHandle {
  close(): void;
  on(event: 'error', listener: () => void): unknown;
}
export type GitWatchFactory = (path: string, listener: GitWatchListener) => GitWatchHandle;
export type GitWatchEnsure = (path: string, filter?: GitWatchFilter, kind?: GitWatchKind) => void;
interface Entry {
  watcher?: GitWatchHandle;
  filter: GitWatchFilter | undefined;
  kind: GitWatchKind;
  suspect: boolean;
}
interface Options {
  open?: GitWatchFactory;
  limit: number;
}

/** Explicit bounded subscriptions, directory-inode replacement fencing and idempotent cleanup. */
export class GitWatchSet {
  private readonly entries = new Map<string, Entry>();
  private closed = false;
  private readonly open: GitWatchFactory;
  events = 0;
  errors = 0;
  peak = 0;

  constructor(
    private readonly wake: (topology: boolean) => void,
    private readonly failed: () => void,
    private readonly options: Options,
  ) {
    this.open =
      options.open ??
      ((path, listener) => watch(path, { persistent: false, encoding: 'utf8' }, listener));
  }
  get size(): number {
    return this.entries.size;
  }

  ensure(path: string, filter?: GitWatchFilter, kind: GitWatchKind = 'work'): void {
    if (this.closed) throw new Error('Git watcher owner closed');
    const existing = this.entries.get(path);
    if (existing && !existing.suspect) {
      existing.filter = filter;
      existing.kind = kind;
      return;
    }
    if (existing) this.remove(path, existing);
    if (this.entries.size >= this.options.limit) throw new Error('Git watcher budget exceeded');
    const entry: Entry = { filter, kind, suspect: false };
    entry.watcher = this.open(path, (event, rawName) => {
      if (this.closed || this.entries.get(path) !== entry) return;
      const name = rawName ?? undefined;
      if (entry.filter && !entry.filter(name)) return;
      this.events += 1;
      if (event === 'rename') entry.suspect = true;
      this.wake(event === 'rename' || !name || entry.kind === 'meta' || name === '.gitignore');
    });
    this.entries.set(path, entry);
    this.peak = Math.max(this.peak, this.size);
    entry.watcher.on('error', () => {
      if (this.closed || this.entries.get(path) !== entry) return;
      this.errors += 1;
      this.remove(path, entry);
      this.failed();
    });
  }

  private remove(path: string, entry: Entry): void {
    this.entries.delete(path);
    entry.watcher?.close();
  }
  retain(desired: ReadonlySet<string>): void {
    for (const [path, entry] of this.entries) if (!desired.has(path)) this.remove(path, entry);
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const [path, entry] of this.entries) this.remove(path, entry);
  }
}
