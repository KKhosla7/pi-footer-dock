import { stripTerminalSequences } from '@earendil-works/pi-tui';
import { safeLabel } from './model.js';

export interface CommitStat {
  files: number;
  added: number;
  deleted: number;
}
export interface CommitInfo {
  hash: string;
  parents: number;
  author: string;
  when: number;
  subject: string;
  stat?: CommitStat;
}
export interface Counts {
  ahead: number;
  behind: number;
}
export interface UpstreamInfo {
  name: string;
  tip?: CommitInfo;
}
export interface AheadReport {
  branch: string | null;
  head?: CommitInfo;
  upstream?: UpstreamInfo;
  counts?: Counts;
  ahead: CommitInfo[];
  behind: CommitInfo[];
  recent: CommitInfo[];
  shallow: boolean;
}

export const COMMIT_FORMAT = '%x00%h%x1f%p%x1f%an%x1f%at%x1f%s';
const TEXT_LIMIT = 500;

export function cleanText(value: string): string {
  return safeLabel(stripTerminalSequences(value.slice(0, TEXT_LIMIT))).trim();
}

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

export function parseCommits(raw: string): CommitInfo[] {
  const commits: CommitInfo[] = [];
  for (const chunk of raw.split('\0')) {
    const commit = chunk ? parseRecord(chunk) : undefined;
    if (commit) commits.push(commit);
  }
  return commits;
}

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

export function relativeTime(nowMs: number, whenSeconds: number): string {
  if (!Number.isFinite(whenSeconds)) return 'unknown date';
  const age = Math.floor(nowMs / 1000 - whenSeconds);
  const unit = UNITS.find(([, seconds]) => age >= seconds);
  if (!unit) return 'just now';
  const amount = Math.floor(age / unit[1]);
  return `${amount} ${unit[0]}${amount === 1 ? '' : 's'} ago`;
}
