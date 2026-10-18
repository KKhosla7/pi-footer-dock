import { randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  openSync,
  readSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { getAgentDir } from '@earendil-works/pi-coding-agent';
import { NAMES } from '../core/product.js';
import { defaultSettings, parseSettings } from '../core/settings.js';
import type { Settings } from '../core/settings.js';

const MAX_BYTES = 16 * 1024;
export interface SettingsLoad {
  settings: Settings;
  /** Why the file was ignored; absent when it was read, or simply does not exist yet. */
  problem?: string;
}

export const settingsPath = (): string => join(getAgentDir(), NAMES.settingsFile);
/** The files the development builds wrote; read when the current one does not exist yet. */
const legacyPaths = (): string[] =>
  NAMES.legacySettingsFiles.map((name) => join(getAgentDir(), name));

function readSafely(path: string): string | undefined {
  let descriptor: number;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw new Error('Settings file cannot be opened (a symbolic link?)', { cause: error });
  }
  try {
    const info = fstatSync(descriptor);
    const posix = process.platform !== 'win32';
    if (!info.isFile() || info.nlink !== 1 || info.size > MAX_BYTES)
      throw new Error('Settings file is not a plain file under 16 KiB');
    if (posix && ((info.mode & 0o077) !== 0 || info.uid !== process.getuid?.()))
      throw new Error('Settings file must be private to you (mode 600)');
    const buffer = Buffer.alloc(info.size);
    readSync(descriptor, buffer, 0, info.size, 0);
    return buffer.toString('utf8');
  } finally {
    closeSync(descriptor);
  }
}

/** Never throws: a missing or unsafe file yields the defaults and, if unsafe, a reason. */
export function loadSettings(path = settingsPath()): SettingsLoad {
  try {
    const text =
      readSafely(path) ??
      (path === settingsPath()
        ? legacyPaths().reduce<string | undefined>(
            (found, old) => found ?? readSafely(old),
            undefined,
          )
        : undefined);
    return { settings: text === undefined ? defaultSettings() : parseSettings(JSON.parse(text)) };
  } catch (error) {
    const reason = error instanceof SyntaxError ? 'not valid JSON' : (error as Error).message;
    return { settings: defaultSettings(), problem: reason };
  }
}

/** Complete-or-nothing: the previous file stays until the new one is fully written. */
export function saveSettings(settings: Settings, path = settingsPath()): void {
  const temporary = `${path}.${process.pid}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600, flag: 'wx' });
    renameSync(temporary, path);
  } catch (error) {
    rmSync(temporary, { force: true });
    throw error;
  }
}
