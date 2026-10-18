import { lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export const MAX_FILES = 2000;
export const MAX_FILE_BYTES = 512 * 1024 * 1024;

export interface LogFile {
  path: string;
  size: number;
  mtimeMs: number;
}

/** One log file if it is a regular file of the user's within the size cap, else nothing. */
export async function statLog(path: string): Promise<LogFile | undefined> {
  const info = await lstat(path).catch(() => undefined);
  if (!info?.isFile() || info.size > MAX_FILE_BYTES) return undefined;
  const uid = process.getuid?.();
  if (uid !== undefined && info.uid !== uid) return undefined;
  return { path, size: info.size, mtimeMs: info.mtimeMs };
}

/**
 * The session logs under `root`: regular files owned by the user, never a link, within the size
 * cap; the newest `MAX_FILES`. Anything else is passed over silently (it is not ours to read).
 */
export async function discoverLogs(root: string): Promise<LogFile[]> {
  const found: LogFile[] = [];
  for (const folder of await readdir(root).catch(() => [] as string[])) {
    const names = await readdir(join(root, folder)).catch(() => [] as string[]);
    for (const name of names.filter((candidate) => candidate.endsWith('.jsonl'))) {
      const log = await statLog(join(root, folder, name));
      if (log) found.push(log);
    }
  }
  return found.sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, MAX_FILES);
}
