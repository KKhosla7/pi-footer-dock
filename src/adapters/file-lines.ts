import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, join, sep } from 'node:path';
import type { FileHandle } from 'node:fs/promises';
import type { FileSize } from '../core/changed-files.js';
import { missingGitPath } from './git-command.js';

export const MAX_FILE_BYTES = 2 * 1024 * 1024;
const BINARY_SNIFF_BYTES = 8 * 1024;
const CHUNK_BYTES = 64 * 1024;
const NEWLINE = 10;

/** Total reads across all files, so a tree of many large files cannot stall the screen. */
export interface ReadBudget {
  bytes: number;
  deadline: AbortSignal;
}

async function countLines(handle: FileHandle): Promise<FileSize> {
  const chunk = Buffer.allocUnsafe(CHUNK_BYTES);
  let total = 0;
  let newlines = 0;
  let last = NEWLINE;
  for (;;) {
    const { bytesRead } = await handle.read(chunk, 0, CHUNK_BYTES, total);
    if (bytesRead === 0) break;
    const data = chunk.subarray(0, bytesRead);
    if (total < BINARY_SNIFF_BYTES && data.subarray(0, BINARY_SNIFF_BYTES - total).includes(0))
      return { kind: 'binary' };
    total += bytesRead;
    if (total > MAX_FILE_BYTES) return { kind: 'large' };
    for (let at = data.indexOf(NEWLINE); at !== -1; at = data.indexOf(NEWLINE, at + 1))
      newlines += 1;
    last = data[bytesRead - 1] ?? NEWLINE;
  }
  return { kind: 'lines', lines: newlines + (last === NEWLINE ? 0 : 1) };
}

async function insideRoot(root: string, path: string): Promise<boolean> {
  const parent = await realpath(dirname(path));
  return parent === root || parent.startsWith(root.endsWith(sep) ? root : root + sep);
}

async function readRegular(path: string): Promise<FileSize> {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = await handle.stat();
    if (!info.isFile()) return { kind: 'unreadable' };
    return info.size > MAX_FILE_BYTES ? { kind: 'large' } : await countLines(handle);
  } finally {
    await handle.close();
  }
}

/**
 * Size of one working-tree file by its repository-relative path. Never follows a symlink, never
 * reads outside the (real) repository root, reads at most 2 MB, and says what it could not read.
 */
export async function measureFile(
  root: string,
  relative: string,
  budget: ReadBudget,
): Promise<FileSize> {
  if (isAbsolute(relative) || relative.split('/').includes('..')) return { kind: 'unreadable' };
  const path = join(root, relative);
  try {
    if (!(await insideRoot(root, path))) return { kind: 'unreadable' };
    const info = await lstat(path);
    if (info.isSymbolicLink()) return { kind: 'symlink' };
    if (info.isDirectory()) return { kind: 'directory' };
    if (!info.isFile()) return { kind: 'unreadable' };
    if (info.size > MAX_FILE_BYTES) return { kind: 'large' };
    if (budget.deadline.aborted || budget.bytes < info.size) return { kind: 'skipped' };
    budget.bytes -= info.size;
    return await readRegular(path);
  } catch (error) {
    return missingGitPath(error) ? { kind: 'deleted' } : { kind: 'unreadable' };
  }
}
