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
import { homedir } from 'node:os';
import { invalidValue, problem } from '../core/problems.js';
import type { Problem } from '../core/problems.js';
import { checkSettings } from '../core/settings-problems.js';
import { defaultSettings, parseSettings } from '../core/settings.js';
import type { Settings } from '../core/settings.js';

const MAX_BYTES = 16 * 1024;
export interface SettingsLoad {
  settings: Settings;
  problem?: string;
  problems?: Problem[];
}

export const settingsPath = (): string => join(getAgentDir(), NAMES.settingsFile);
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

const tidy = (path: string): string => {
  const home = homedir();
  return path.startsWith(`${home}/`) ? `~${path.slice(home.length)}` : path;
};
function fileProblem(error: unknown, path: string): Problem {
  const where = tidy(path);
  if (error instanceof SyntaxError)
    return problem(
      where,
      '(file)',
      `The file is not valid JSON: ${error.message}`,
      'Fix the syntax (a missing comma, quote or brace is the usual cause), or move the file away to start again.',
    );
  const message = error instanceof Error ? error.message : 'The file cannot be read';
  const fix = message.includes('mode 600')
    ? `Run: chmod 600 ${tidy(path)}`
    : message.includes('symbolic link')
      ? 'Replace the link with a regular file that only you can read and write.'
      : 'Make it a regular file of at most 16 KiB that only you can read and write.';
  return problem(where, '(file)', message, fix);
}

export function loadSettings(path = settingsPath()): SettingsLoad {
  let text: string | undefined;
  try {
    text =
      readSafely(path) ??
      (path === settingsPath()
        ? legacyPaths().reduce<string | undefined>(
            (found, old) => found ?? readSafely(old),
            undefined,
          )
        : undefined);
  } catch (error) {
    return refused([fileProblem(error, path)]);
  }
  if (text === undefined) return { settings: defaultSettings() };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return refused([fileProblem(error, path)]);
  }
  const problems = checkSettings(value, tidy(path));
  if (problems.length > 0) return refused(problems);
  try {
    return { settings: parseSettings(value) };
  } catch (error) {
    return refused([invalidValue(tidy(path), '(settings)', undefined, error)]);
  }
}
const refused = (problems: Problem[]): SettingsLoad => ({
  settings: defaultSettings(),
  problem: problems[0]?.reason ?? 'The settings are not valid.',
  problems,
});

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
