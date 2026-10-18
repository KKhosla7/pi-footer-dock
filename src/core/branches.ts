import { safeLabel } from './model.js';

/** Ref names cannot contain control characters, so neither this nor a newline can occur in one. */
const SEPARATOR = '\u001f';

/** The `--format` for `git for-each-ref`; `parseBranches` reads exactly these fields. */
export const BRANCH_FORMAT = [
  '%(HEAD)',
  '%(refname)',
  '%(objectname:short)',
  '%(committerdate:unix)',
  '%(upstream:short)',
  '%(upstream:track)',
  '%(symref)',
].join(SEPARATOR);

export interface Upstream {
  name: string;
  ahead: number;
  behind: number;
  /** The upstream branch no longer exists. */
  gone: boolean;
}
export interface Branch {
  name: string;
  current: boolean;
  hash: string;
  /** Last commit time in seconds since the epoch, when git reported one. */
  time: number | undefined;
  upstream: Upstream | undefined;
}
export interface BranchList {
  /** Current branch first, then newest commit first. */
  locals: Branch[];
  /** Remote-tracking branches, newest commit first; the symbolic `origin/HEAD` is left out. */
  remotes: Branch[];
  /** Local branches exist but none is checked out. */
  detached: boolean;
}
export type BranchResult = { ok: true; list: BranchList } | { ok: false; message: string };

const FIELDS = 7;

function count(track: string, word: string): number {
  const found = new RegExp(`${word} (\\d+)`, 'u').exec(track);
  return found?.[1] === undefined ? 0 : Number(found[1]);
}

function parseUpstream(name: string, track: string): Upstream | undefined {
  const label = safeLabel(name);
  if (label === '') return undefined;
  return {
    name: label,
    ahead: count(track, 'ahead'),
    behind: count(track, 'behind'),
    gone: track.includes('gone'),
  };
}

function parseTime(text: string): number | undefined {
  const seconds = Number(text);
  return text !== '' && Number.isFinite(seconds) ? seconds : undefined;
}

function newestFirst(a: Branch, b: Branch): number {
  const byTime = (b.time ?? 0) - (a.time ?? 0);
  if (byTime !== 0) return byTime;
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
}

/** Local branches: the current one first, then newest commit first. */
function localOrder(a: Branch, b: Branch): number {
  if (a.current !== b.current) return a.current ? -1 : 1;
  return newestFirst(a, b);
}

function branchOf(fields: string[], name: string): Branch | undefined {
  const [head = '', , hash = '', time = '', upstream = '', track = ''] = fields;
  const label = safeLabel(name);
  if (label === '') return undefined;
  return {
    name: label,
    current: head === '*',
    hash: safeLabel(hash),
    time: parseTime(time),
    upstream: upstream === '' ? undefined : parseUpstream(upstream, track),
  };
}

/** Parses the output of `git for-each-ref --format=BRANCH_FORMAT refs/heads refs/remotes`. */
export function parseBranches(raw: string): BranchList {
  const locals: Branch[] = [];
  const remotes: Branch[] = [];
  for (const line of raw.split('\n')) {
    const fields = line.split(SEPARATOR);
    if (fields.length !== FIELDS) continue;
    const ref = fields[1] ?? '';
    if (ref.startsWith('refs/heads/')) {
      const branch = branchOf(fields, ref.slice('refs/heads/'.length));
      if (branch) locals.push(branch);
    } else if (ref.startsWith('refs/remotes/') && fields[6] === '') {
      const branch = branchOf(fields, ref.slice('refs/remotes/'.length));
      if (branch) remotes.push({ ...branch, current: false, upstream: undefined });
    }
  }
  locals.sort(localOrder);
  remotes.sort(newestFirst);
  return { locals, remotes, detached: locals.length > 0 && !locals.some((b) => b.current) };
}
