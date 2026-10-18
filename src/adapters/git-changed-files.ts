import { realpath } from 'node:fs/promises';
import {
  mergeChangedFiles,
  MAX_ROWS,
  parseNumstat,
  parseStatusEntries,
} from '../core/changed-files.js';
import type { ChangedFilesState, FileSize, StatusEntry } from '../core/changed-files.js';
import { gitLine, gitOutput } from './git-command.js';
import { measureFile } from './file-lines.js';
import type { ReadBudget } from './file-lines.js';

const GIT_DEADLINE_MS = 5000;
const READ_DEADLINE_MS = 4000;
const READ_BUDGET_BYTES = 32 * 1024 * 1024;
const CONCURRENT_READS = 6;

function failureKind(error: unknown): 'not-repository' | 'git-missing' | 'failed' {
  const code = error instanceof Error && error.cause instanceof Error ? error.cause : undefined;
  const status = code && 'code' in code ? code.code : undefined;
  if (status === 'ENOENT') return 'git-missing';
  return status === 128 ? 'not-repository' : 'failed';
}

/** HEAD, or the empty tree in a repository without commits (asked from Git, not hard-coded). */
export async function baseline(root: string, signal: AbortSignal): Promise<string> {
  const head = gitLine(
    await gitOutput(root, ['rev-parse', '--verify', '--quiet', 'HEAD'], signal, {
      allowNoMatch: true,
    }),
  );
  if (head) return 'HEAD';
  const args = ['hash-object', '-t', 'tree', '--stdin'];
  return gitLine(await gitOutput(root, args, signal, { input: '' }));
}

/** Rows to measure: the first ones that are drawn, then untracked ones that only feed the header. */
function toMeasure(entries: readonly StatusEntry[]): StatusEntry[] {
  const sorted = [...entries].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const drawn = sorted.slice(0, MAX_ROWS);
  const hidden = sorted.slice(MAX_ROWS).filter((entry) => entry.status === '?');
  return [...drawn, ...hidden].filter((entry) => !entry.submodule);
}

async function measureAll(
  root: string,
  entries: readonly StatusEntry[],
): Promise<Map<string, FileSize>> {
  const sizes = new Map<string, FileSize>();
  const budget: ReadBudget = {
    bytes: READ_BUDGET_BYTES,
    deadline: AbortSignal.timeout(READ_DEADLINE_MS),
  };
  const queue = toMeasure(entries);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let entry = queue[next++]; entry; entry = queue[next++])
      sizes.set(entry.path, await measureFile(root, entry.path, budget));
  };
  await Promise.all(Array.from({ length: CONCURRENT_READS }, worker));
  return sizes;
}

async function read(cwd: string, signal: AbortSignal): Promise<ChangedFilesState> {
  const top = gitLine(await gitOutput(cwd, ['rev-parse', '--show-toplevel'], signal));
  const root = await realpath(top);
  const status = await gitOutput(
    root,
    ['status', '--porcelain=v2', '-z', '--untracked-files=all'],
    signal,
  );
  const entries = parseStatusEntries(status);
  if (!entries.length) return { kind: 'files', files: [] };
  const diff = ['diff', '--numstat', '-z', '--no-ext-diff', '--no-textconv'];
  const numstat = await gitOutput(root, [...diff, await baseline(root, signal), '--'], signal);
  const sizes = await measureAll(root, entries);
  return { kind: 'files', files: mergeChangedFiles(entries, parseNumstat(numstat), sizes) };
}

/** Every file the footer counts, with line counts; failures become a state, never an exception. */
export async function readChangedFiles(cwd: string): Promise<ChangedFilesState> {
  try {
    return await read(cwd, AbortSignal.timeout(GIT_DEADLINE_MS));
  } catch (error) {
    return { kind: failureKind(error) };
  }
}
