import { execFile } from 'node:child_process';

/**
 * Config keys that make a read-only git command run a program. Only a repository's OWN config is
 * untrusted (a cloned or unpacked folder can carry any); the user's global and system config is
 * theirs, so a filter set there (git-lfs, for example) keeps working.
 */
const RUNS_PROGRAMS = new RegExp(
  '^(' +
    [
      'core\\.fsmonitor',
      'core\\.pager',
      'core\\.editor',
      'core\\.sshcommand',
      'core\\.askpass',
      'diff\\.external',
      'credential\\..*helper',
      'gpg\\.(.+\\.)?program',
      'filter\\..+\\.(clean|smudge|process)',
      'diff\\..+\\.(textconv|command)',
      'merge\\..+\\.(driver|recursive)',
    ].join('|') +
    ')$',
  'iu',
);
const UNTRUSTED_SCOPES = new Set(['local', 'worktree']);
/** Always off, whatever the config says: the one that fires on every status. */
const ALWAYS = ['-c', 'core.fsmonitor=false'];

/**
 * `git config --list --show-scope -z` is `scope NUL key NEWLINE value NUL` repeated. Returns the
 * `-c key=` overrides that switch off every program the repository's own config asks git to run.
 */
export function inertOverrides(configList: string): string[] {
  const keys = new Set<string>();
  const fields = configList.split('\0');
  for (let index = 0; index + 1 < fields.length; index += 2) {
    const scope = fields[index] ?? '';
    const key = (fields[index + 1] ?? '').split('\n')[0] ?? '';
    if (UNTRUSTED_SCOPES.has(scope) && RUNS_PROGRAMS.test(key)) keys.add(key);
  }
  return [...keys].flatMap((key) => ['-c', `${key}=`]);
}

interface Entry {
  at: number;
  args: string[];
}
const TTL_MS = 5000;
const MAX_CACHED = 32;
const cache = new Map<string, Entry>();

function listConfig(cwd: string, signal: AbortSignal): Promise<string> {
  return new Promise((accept) => {
    execFile(
      'git',
      ['--no-optional-locks', 'config', '--list', '--show-scope', '-z'],
      { cwd, signal, timeout: 3000, maxBuffer: 1024 * 1024, env: { ...process.env } },
      // A failed read is no reason to skip the protection that does not depend on it.
      (error, stdout) => {
        accept(error ? '' : stdout);
      },
    );
  });
}

/** The arguments every git call must carry for this folder, remembered for a few seconds. */
export async function inertArguments(cwd: string, signal: AbortSignal): Promise<string[]> {
  const now = Date.now();
  const known = cache.get(cwd);
  if (known && now - known.at < TTL_MS) return known.args;
  const args = [...ALWAYS, ...inertOverrides(await listConfig(cwd, signal))];
  if (cache.size >= MAX_CACHED) cache.clear();
  cache.set(cwd, { at: now, args });
  return args;
}
/** For tests: forget what was learned about a folder. */
export function forgetInert(): void {
  cache.clear();
}
