import { AHEAD_LIMIT, SIDE_LIMIT } from '../core/ahead-lines.js';
import { COMMIT_FORMAT, parseCommits, parseCounts } from '../core/ahead-parse.js';
import type { AheadReport, CommitInfo, Counts } from '../core/ahead-parse.js';
import { gitLine, gitOutput } from './git-command.js';

type Git = (args: string[], allowNoMatch?: boolean) => Promise<string>;

const LOG = ['log', '--no-show-signature', '--no-color', '--no-decorate', '--encoding=UTF-8'];

/** Read-only `git log` for a revision range; every revision list ends with `--`. */
async function commits(git: Git, range: string, max: number, stat: boolean): Promise<CommitInfo[]> {
  const args = [...LOG, `--max-count=${max}`, `--format=${COMMIT_FORMAT}`];
  return parseCommits(await git([...args, ...(stat ? ['--shortstat'] : []), range, '--']));
}

/** The configured upstream as a full ref and a short name; undefined when none is configured. */
async function upstreamOf(
  git: Git,
  branch: string,
): Promise<{ ref: string; name: string } | undefined> {
  const format = '--format=%(upstream)%1f%(upstream:short)';
  const [ref = '', name = ''] = gitLine(
    await git(['for-each-ref', format, `refs/heads/${branch}`]),
  ).split('\x1f');
  return ref.startsWith('refs/') && name ? { ref, name } : undefined;
}

async function exists(git: Git, ref: string): Promise<boolean> {
  return (await git(['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], true)).trim() !== '';
}

async function countsAgainst(git: Git, ref: string): Promise<Counts | undefined> {
  return parseCounts(await git(['rev-list', '--left-right', '--count', `${ref}...HEAD`, '--']));
}

/** Reads where HEAD is and what is ahead of its upstream, from local refs only (no network). */
export async function readAhead(cwd: string, signal: AbortSignal): Promise<AheadReport> {
  const git: Git = (args, allowNoMatch = false) => gitOutput(cwd, args, signal, { allowNoMatch });
  const name = gitLine(await git(['symbolic-ref', '--short', '-q', 'HEAD'], true));
  const branch = name || null;
  const [head] = await commits(git, 'HEAD', 1, false).catch(() => []);
  const shallow = gitLine(await git(['rev-parse', '--is-shallow-repository'])) === 'true';
  const report: AheadReport = {
    branch,
    ...(head ? { head } : {}),
    ahead: [],
    behind: [],
    recent: [],
    shallow,
  };
  if (!head) return report;
  const upstream = branch ? await upstreamOf(git, branch) : undefined;
  if (!upstream) return { ...report, recent: await commits(git, 'HEAD', SIDE_LIMIT, true) };
  if (!(await exists(git, upstream.ref)))
    return {
      ...report,
      upstream: { name: upstream.name },
      recent: await commits(git, 'HEAD', SIDE_LIMIT, true),
    };
  const counts = await countsAgainst(git, upstream.ref);
  if (!counts) throw new Error('Unreadable ahead/behind counts');
  const [tip] = await commits(git, upstream.ref, 1, false);
  return {
    ...report,
    upstream: { name: upstream.name, ...(tip ? { tip } : {}) },
    counts,
    ahead: counts.ahead ? await commits(git, `${upstream.ref}..HEAD`, AHEAD_LIMIT, true) : [],
    behind: counts.behind ? await commits(git, `HEAD..${upstream.ref}`, SIDE_LIMIT, true) : [],
  };
}

/** One plain sentence for the screen when a query failed. */
export function aheadFailure(error: unknown): string {
  const cause = error instanceof Error ? error.cause : undefined;
  const code = cause instanceof Error && 'code' in cause ? cause.code : undefined;
  if (code === 'ENOENT') return 'git is not installed or not on PATH.';
  if (code === 128) return 'This folder is not inside a git repository.';
  if (code === 'ETIMEDOUT' || code === 'ABORT_ERR') return 'git took too long to answer.';
  return 'git could not be read.';
}
