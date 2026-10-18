import { realpath } from 'node:fs/promises';
import type { FileStatus } from '../core/changed-files.js';
import { baseline } from './git-changed-files.js';
import { gitLine, gitOutput } from './git-command.js';

const DEADLINE_MS = 5000;
/** Lines kept from Git's answer; the rest is summarised, so a huge file cannot flood the screen. */
export const MAX_DIFF_LINES = 5000;
const NO_COLOUR = ['--no-ext-diff', '--no-textconv', '--no-color', '-U3'];

export type DiffResult =
  { ok: true; lines: string[]; omitted: number } | { ok: false; message: string };

function split(text: string): { lines: string[]; omitted: number } {
  const all = text.split('\n');
  if (all.at(-1) === '') all.pop();
  return { lines: all.slice(0, MAX_DIFF_LINES), omitted: Math.max(0, all.length - MAX_DIFF_LINES) };
}

/**
 * What changed in one file, as Git prints it: against HEAD for a tracked file (staged and unstaged
 * together), the whole file as additions for an untracked one. Read-only and inert like every Git
 * read here; the path is only ever an argument after `--`.
 */
export async function readFileDiff(
  cwd: string,
  file: { path: string; status: FileStatus },
  signal: AbortSignal = AbortSignal.timeout(DEADLINE_MS),
): Promise<DiffResult> {
  try {
    const root = await realpath(
      gitLine(await gitOutput(cwd, ['rev-parse', '--show-toplevel'], signal)),
    );
    const args =
      file.status === '?'
        ? ['diff', '--no-index', ...NO_COLOUR, '--', '/dev/null', file.path]
        : ['diff', ...NO_COLOUR, await baseline(root, signal), '--', file.path];
    // `--no-index` exits with 1 when the files differ, which is the normal answer here.
    const text = await gitOutput(root, args, signal, { allowNoMatch: true });
    return { ok: true, ...split(text) };
  } catch (error) {
    const big =
      error instanceof Error &&
      error.cause instanceof Error &&
      error.cause.message.includes('maxBuffer');
    return {
      ok: false,
      message: big
        ? 'This diff is too large to show here (over 2 MB). Use git diff in a terminal.'
        : 'Git could not show this diff (it timed out or the repository is not readable).',
    };
  }
}
