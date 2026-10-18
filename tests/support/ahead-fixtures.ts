import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { quotaRoot } from './quota-fixtures.js';

/** Fixed clock for commit dates: 2020-01-01T00:00:00Z plus whole days. */
export const DAY = 86_400;
export const EPOCH = 1_577_836_800;

const isolated = {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_TERMINAL_PROMPT: '0',
};
Object.assign(process.env, isolated);

export function git(cwd: string, ...args: string[]): string {
  return execFileSync(
    'git',
    ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args],
    {
      cwd,
      encoding: 'utf8',
      env: { ...process.env, ...isolated },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

/** Commits `files` (path to content) at EPOCH + day days. */
export function commit(
  cwd: string,
  message: string,
  day: number,
  files: Record<string, string> = {},
): void {
  for (const [path, content] of Object.entries(files)) writeFileSync(join(cwd, path), content);
  const date = `${EPOCH + day * DAY} +0000`;
  const env = { ...process.env, ...isolated, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
  execFileSync('git', ['add', '-A'], { cwd, env });
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Ann Author',
      '-c',
      'user.email=ann@example.invalid',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      message,
    ],
    { cwd, env },
  );
}

/** A work repository on `main` with a bare local `origin` it has pushed two commits to. */
export function pushedRepository(t: TestContext) {
  const root = quotaRoot(t);
  const origin = join(root, 'origin.git');
  const cwd = join(root, 'work');
  mkdirSync(cwd);
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(cwd, 'init', '-q', '-b', 'main');
  commit(cwd, 'Start project', 1, { 'a.txt': 'one\ntwo\n' });
  commit(cwd, 'Second pushed commit', 2, { 'b.txt': 'b\n' });
  git(cwd, 'remote', 'add', 'origin', origin);
  git(cwd, 'push', '-q', '-u', 'origin', 'main');
  return { root, origin, cwd };
}

/** A true (--no-ff) merge commit dated EPOCH + day days. */
export function merge(cwd: string, branch: string, message: string, day: number): void {
  const date = `${EPOCH + day * DAY} +0000`;
  const env = { ...process.env, ...isolated, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date };
  execFileSync(
    'git',
    [
      '-c',
      'user.name=Ann Author',
      '-c',
      'user.email=ann@example.invalid',
      'merge',
      '-q',
      '--no-ff',
      '-m',
      message,
      branch,
    ],
    { cwd, env },
  );
}
