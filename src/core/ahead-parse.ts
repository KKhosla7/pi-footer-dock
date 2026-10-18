import { stripTerminalSequences } from '@earendil-works/pi-tui';
import { safeLabel } from './model.js';

/** What `--shortstat` reports for one commit. */
export interface CommitStat {
  files: number;
  added: number;
  deleted: number;
}
export interface CommitInfo {
  hash: string;
  parents: number;
  author: string;
  /** Unix seconds; NaN when git printed something unreadable. */
  when: number;
  subject: string;
  /** Absent for merges, empty commits and binary-only changes. */
  stat?: CommitStat;
}
export interface Counts {
  ahead: number;
  behind: number;
}
export interface UpstreamInfo {
  name: string;
  /** Undefined when the upstream branch no longer exists locally (`[gone]`). */
  tip?: CommitInfo;
}
/** Everything the screen shows, as typed data read from git. */
export interface AheadReport {
  /** Null on a detached HEAD. */
  branch: string | null;
  /** Undefined before the first commit. */
  head?: CommitInfo;
  upstream?: UpstreamInfo;
  /** Known only with a live upstream. */
  counts?: Counts;
  ahead: CommitInfo[];
  behind: CommitInfo[];
  /** Context for when ahead is unknown. */
  recent: CommitInfo[];
  shallow: boolean;
}

/** Records start with NUL (git cannot store one in a message); the subject is the last field. */
export const COMMIT_FORMAT = '%x00%h%x1f%p%x1f%an%x1f%at%x1f%s';
const TEXT_LIMIT = 500;

/** Strips escape sequences and control characters, and bounds the length. */
export function cleanText(value: string): string {
  return safeLabel(stripTerminalSequences(value.slice(0, TEXT_LIMIT))).trim();
}

/** Reads the numbers and the `(+)`/`(-)` markers, so a translated git still parses. */
export function parseStat(text: string): CommitStat | undefined {
  const line = text.split('\n').find((candidate) => /^\s*\d+\s/u.test(candidate));
  if (!line) return undefined;
  const count = (pattern: RegExp): number => Number(pattern.exec(line)?.[1] ?? 0);
  return {
    files: count(/^\s*(\d+)/u),
    added: count(/(\d+)[^\d,]*\(\+\)/u),
    deleted: count(/(\d+)[^\d,]*\(-\)/u),
  };
}

function parseRecord(chunk: string): CommitInfo | undefined {
  const newline = chunk.indexOf('\n');
  const fields = (newline < 0 ? chunk : chunk.slice(0, newline)).split('\x1f');
  const [hash = '', parents = '', author = '', when = ''] = fields;
  if (fields.length < 5 || !/^[0-9a-f]{4,64}$/u.test(hash)) return undefined;
  const stat = newline < 0 ? undefined : parseStat(chunk.slice(newline + 1));
  return {
    hash,
    parents: parents.split(' ').filter(Boolean).length,
    author: cleanText(author),
    when: /^\d+$/u.test(when) ? Number(when) : Number.NaN,
    subject: cleanText(fields.slice(4).join(' ')),
    ...(stat ? { stat } : {}),
  };
}

/** Parses `git log --format=COMMIT_FORMAT [--shortstat]`; records that do not parse are dropped. */
export function parseCommits(raw: string): CommitInfo[] {
  const commits: CommitInfo[] = [];
  for (const chunk of raw.split('\0')) {
    const commit = chunk ? parseRecord(chunk) : undefined;
    if (commit) commits.push(commit);
  }
  return commits;
}

/** `git rev-list --left-right --count <upstream>...HEAD` prints `behind<TAB>ahead`. */
export function parseCounts(raw: string): Counts | undefined {
  const match = /^(\d+)\s+(\d+)\s*$/u.exec(raw);
  return match ? { behind: Number(match[1]), ahead: Number(match[2]) } : undefined;
}

const UNITS: readonly (readonly [string, number])[] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3600],
  ['minute', 60],
];

/** "3 days ago" from unix seconds; a date in the future or unreadable never throws. */
export function relativeTime(nowMs: number, whenSeconds: number): string {
  if (!Number.isFinite(whenSeconds)) return 'unknown date';
  const age = Math.floor(nowMs / 1000 - whenSeconds);
  const unit = UNITS.find(([, seconds]) => age >= seconds);
  if (!unit) return 'just now';
  const amount = Math.floor(age / unit[1]);
  return `${amount} ${unit[0]}${amount === 1 ? '' : 's'} ago`;
}
