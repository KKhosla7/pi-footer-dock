import type { GitState } from '../core/model.js';
import { gitOutput } from './git-command.js';

export const unknownGit: GitState = { branch: null, changed: null, ahead: null };

/** NUL-separated porcelain v2 keeps rename paths and embedded newlines unambiguous. */
export function parseGitStatus(output: string): GitState {
  const records = output.split('\0');
  let branch: string | null = null;
  let ahead: number | null = null;
  let changed = 0;
  for (let index = 0; index < records.length; index += 1) {
    const record = records[index] ?? '';
    if (record.startsWith('# branch.head ')) branch = record.slice(14);
    if (record.startsWith('# branch.ab '))
      ahead = Number(/^# branch.ab \+(\d+)/u.exec(record)?.[1] ?? 0);
    if (/^[12u?] /u.test(record)) changed += 1;
    if (record.startsWith('2 ')) index += 1;
  }
  return { branch, changed, ahead };
}

export async function readGit(cwd: string, signal?: AbortSignal): Promise<GitState> {
  try {
    const output = await gitOutput(
      cwd,
      ['status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all'],
      signal ?? AbortSignal.timeout(5000),
    );
    return parseGitStatus(output);
  } catch {
    // Non-repository, unavailable git, abort, timeout and oversized output all mean unknown.
    return unknownGit;
  }
}
