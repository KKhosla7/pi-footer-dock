/** One-letter badge: modified, added, deleted, renamed, untracked, conflicted. */
export type FileStatus = 'M' | 'A' | 'D' | 'R' | '?' | 'U';

/** What the working-tree file turned out to be; `lines` is its total line count. */
export type FileSize =
  | { kind: 'lines'; lines: number }
  | {
      kind:
        | 'deleted'
        | 'binary'
        | 'large'
        | 'symlink'
        | 'submodule'
        | 'directory'
        | 'unreadable'
        | 'skipped';
    };

/** A path the footer counts, as `git status` reports it. */
export interface StatusEntry {
  path: string;
  status: FileStatus;
  submodule: boolean;
}

/** Added and removed lines from `git diff --numstat`; null for a binary file. */
export interface Numstat {
  added: number | null;
  removed: number | null;
}

export interface ChangedFile {
  path: string;
  status: FileStatus;
  size: FileSize;
  /** null when it cannot be counted (binary, too large, not read). */
  added: number | null;
  removed: number | null;
}

export type ChangedFilesState =
  { kind: 'files'; files: ChangedFile[] } | { kind: 'not-repository' | 'git-missing' | 'failed' };

export const MAX_ROWS = 300;

function pathAfter(record: string, fields: number): string {
  let index = -1;
  for (let seen = 0; seen < fields; seen += 1) index = record.indexOf(' ', index + 1);
  return record.slice(index + 1);
}

function letter(xy: string, renamed: boolean): FileStatus {
  if (renamed) return 'R';
  if (xy.includes('D')) return 'D';
  return xy.startsWith('A') || xy.endsWith('A') ? 'A' : 'M';
}

/** Parses `status --porcelain=v2 -z`: the records the footer counts (`1`, `2`, `u`, `?`). */
export function parseStatusEntries(output: string): StatusEntry[] {
  const records = output.split('\0');
  const entries: StatusEntry[] = [];
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? '';
    const xy = record.slice(2, 4);
    const submodule = record.charAt(5) === 'S';
    if (record.startsWith('1 ')) {
      entries.push({ path: pathAfter(record, 8), status: letter(xy, false), submodule });
    } else if (record.startsWith('2 ')) {
      entries.push({ path: pathAfter(record, 9), status: letter(xy, true), submodule });
      index += 1; // the original path of a rename or copy follows as its own record
    } else if (record.startsWith('u ')) {
      entries.push({ path: pathAfter(record, 10), status: 'U', submodule });
    } else if (record.startsWith('? ')) {
      entries.push({ path: record.slice(2), status: '?', submodule: false });
    }
  }
  return entries;
}

const COUNT = (value: string | undefined): number | null =>
  value === undefined || value === '-' ? null : Number(value);

/** Parses `diff --numstat -z`; a rename is keyed by its new path. */
export function parseNumstat(output: string): Map<string, Numstat> {
  const tokens = output.split('\0');
  const stats = new Map<string, Numstat>();
  for (let index = 0; index < tokens.length; index += 1) {
    const match = /^(\d+|-)\t(\d+|-)\t([^]*)$/u.exec(tokens[index] ?? '');
    if (!match) continue;
    let path = match[3] ?? '';
    if (path === '') {
      path = tokens[index + 2] ?? '';
      index += 2;
    }
    stats.set(path, { added: COUNT(match[1]), removed: COUNT(match[2]) });
  }
  return stats;
}

function counts(entry: StatusEntry, size: FileSize, stat: Numstat | undefined) {
  if (entry.submodule) return { added: null, removed: null };
  if (entry.status === '?') {
    if (size.kind === 'lines') return { added: size.lines, removed: 0 };
    return { added: size.kind === 'symlink' ? 1 : null, removed: 0 };
  }
  return stat ?? { added: 0, removed: 0 };
}

/** One file per status entry, sorted by path; line counts come from numstat or the file itself. */
export function mergeChangedFiles(
  entries: readonly StatusEntry[],
  numstat: ReadonlyMap<string, Numstat>,
  sizes: ReadonlyMap<string, FileSize>,
): ChangedFile[] {
  return entries
    .map((entry): ChangedFile => {
      const size: FileSize =
        sizes.get(entry.path) ?? (entry.submodule ? { kind: 'submodule' } : { kind: 'skipped' });
      const stat = numstat.get(entry.path);
      const binary = stat?.added === null || size.kind === 'binary';
      const found = binary ? { added: null, removed: null } : counts(entry, size, stat);
      return { path: entry.path, status: entry.status, size, ...found };
    })
    .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

export interface Totals {
  files: number;
  added: number;
  removed: number;
  /** An untracked file was not read (budget or deadline), so the totals are a lower bound. */
  partial: boolean;
}

export function summarize(files: readonly ChangedFile[]): Totals {
  const totals: Totals = { files: files.length, added: 0, removed: 0, partial: false };
  for (const file of files) {
    totals.added += file.added ?? 0;
    totals.removed += file.removed ?? 0;
    if (file.status === '?' && file.size.kind === 'skipped') totals.partial = true;
  }
  return totals;
}
