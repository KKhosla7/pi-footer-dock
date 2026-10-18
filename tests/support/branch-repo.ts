import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { quotaRoot } from './quota-fixtures.js';

/** Keeps the user's git configuration and terminal prompts out of the tests. */
export const isolatedGit = {
  GIT_CONFIG_GLOBAL: '/nonexistent/dock-gitconfig',
  GIT_CONFIG_SYSTEM: '/nonexistent/dock-gitconfig',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_TERMINAL_PROMPT: '0',
};

export function gitIn(cwd: string, date: string | undefined, ...args: string[]): string {
  const dated = date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {};
  return execFileSync(
    'git',
    ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args],
    {
      cwd,
      env: { ...process.env, ...isolatedGit, ...dated },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
}

/** A repository with a bare `origin`, branches ahead, behind and gone, and awkward names. */
export function createBranchRepo(t: TestContext) {
  const root = quotaRoot(t);
  const cwd = join(root, 'repo');
  const origin = join(root, 'origin.git');
  mkdirSync(cwd);
  const git = (date: string | undefined, ...args: string[]) => gitIn(cwd, date, ...args);
  const commit = (message: string, date: string) => {
    writeFileSync(join(cwd, 'file.txt'), message);
    git(undefined, 'add', '.');
    git(date, 'commit', '-m', message);
  };
  git(undefined, 'init', '--template=', '-b', 'main');
  git(undefined, 'init', '--template=', '--bare', '-b', 'main', origin);
  commit('one', '2024-01-01T12:00:00Z');
  commit('two', '2024-01-10T12:00:00Z');
  git(undefined, 'remote', 'add', 'origin', origin);
  git(undefined, 'push', '-u', 'origin', 'main');
  git(undefined, 'remote', 'set-head', 'origin', 'main');
  git(undefined, 'branch', 'release/1.2', 'HEAD~1');
  git(undefined, 'update-ref', 'refs/heads/-x', 'HEAD~1');
  git(undefined, 'branch', 'ünï/日本');
  git(undefined, 'branch', 'gone-up');
  git(undefined, 'push', '-u', 'origin', 'gone-up');
  git(undefined, 'push', 'origin', '--delete', 'gone-up');
  git(undefined, 'fetch', '--prune', 'origin');
  git(undefined, 'checkout', '-b', 'feature/ahead');
  git(undefined, 'push', '-u', 'origin', 'feature/ahead');
  commit('three', '2024-01-20T12:00:00Z');
  git(undefined, 'checkout', 'main');
  git(undefined, 'checkout', '-b', 'behind');
  commit('four', '2024-01-15T12:00:00Z');
  git(undefined, 'push', '-u', 'origin', 'behind');
  git(undefined, 'checkout', 'main');
  git(undefined, 'branch', '-f', 'behind', 'main');
  return { root, cwd, git };
}
