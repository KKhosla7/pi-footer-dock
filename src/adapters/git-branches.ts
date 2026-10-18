import { BRANCH_FORMAT, parseBranches } from '../core/branches.js';
import type { BranchResult } from '../core/branches.js';
import { gitOutput, missingGitPath } from './git-command.js';

const ARGS = [
  'for-each-ref',
  '--sort=-committerdate',
  `--format=${BRANCH_FORMAT}`,
  'refs/heads',
  'refs/remotes',
];

function failure(error: unknown): string {
  const cause = error instanceof Error ? error.cause : undefined;
  if (missingGitPath(cause)) return 'git is not installed or not on PATH.';
  if (cause instanceof Error && 'code' in cause && cause.code === 128)
    return 'This folder is not a git repository.';
  return 'Could not read the branches from git (it failed or took too long).';
}

/** One bounded read-only `git for-each-ref`; it never uses the network and never throws. */
export async function loadBranches(cwd: string, signal: AbortSignal): Promise<BranchResult> {
  try {
    return { ok: true, list: parseBranches(await gitOutput(cwd, ARGS, signal)) };
  } catch (error) {
    return { ok: false, message: failure(error) };
  }
}
