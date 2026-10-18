import { randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, rename, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { parseCache, serializeCache } from '../../core/history/cache-format.js';
import type { FileEntry } from '../../core/history/cache-format.js';

const MAX_BYTES = 32 * 1024 * 1024;

/** The saved rollup, or nothing when it is missing, unsafe, too large or not exactly our format. */
export async function loadCache(path: string): Promise<FileEntry[]> {
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = await handle.stat();
    const mine = process.getuid === undefined || info.uid === process.getuid();
    if (!info.isFile() || info.size > MAX_BYTES || !mine) return [];
    return parseCache(JSON.parse(await handle.readFile('utf8')))?.files ?? [];
  } catch {
    return [];
  } finally {
    await handle?.close();
  }
}

/** Complete-or-nothing, private to the user: a temp file written exclusively, then renamed. */
export async function saveCache(path: string, files: readonly FileEntry[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, serializeCache(files), { mode: 0o600, flag: 'wx' });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}
