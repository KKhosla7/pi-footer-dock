import { execFile } from 'node:child_process';

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
const ALWAYS = ['-c', 'core.fsmonitor=false'];

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
      (error, stdout) => {
        accept(error ? '' : stdout);
      },
    );
  });
}

export async function inertArguments(cwd: string, signal: AbortSignal): Promise<string[]> {
  const now = Date.now();
  const known = cache.get(cwd);
  if (known && now - known.at < TTL_MS) return known.args;
  const args = [...ALWAYS, ...inertOverrides(await listConfig(cwd, signal))];
  if (cache.size >= MAX_CACHED) cache.clear();
  cache.set(cwd, { at: now, args });
  return args;
}
export function forgetInert(): void {
  cache.clear();
}
