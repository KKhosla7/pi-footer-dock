import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const execute = promisify(execFile);

/** All Git writes/pushes target owned temporary repositories, never GitHub/user configuration. */
export async function createGitRepository() {
  const root = await mkdtemp(join(tmpdir(), 'dock-git-integration-'));
  const cwd = join(root, 'repo');
  const remote = join(root, 'origin.git');
  await mkdir(cwd);
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: '/dev/null',
    GIT_CONFIG_SYSTEM: '/dev/null',
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
  };
  const git = async (...args: string[]): Promise<void> => {
    await execute(
      'git',
      ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args],
      { cwd, env },
    );
  };
  await git('init', '--template=', '-b', 'main');
  await git('init', '--template=', '--bare', remote);
  await writeFile(join(cwd, '.gitignore'), '*.ignored\nauth.json\nmodels-store.json\n');
  await writeFile(join(cwd, 'tracked.txt'), 'fixture\n');
  await git('add', '.');
  await git('commit', '-m', 'fixture seed');
  await git('remote', 'add', 'origin', remote);
  await git('push', '-u', 'origin', 'main');
  return { root, cwd, git, close: () => rm(root, { recursive: true, force: true }) };
}

export async function waitForGit(predicate: () => boolean, timeout = 6000): Promise<void> {
  const started = performance.now();
  while (!predicate() && performance.now() - started < timeout) await delay(10);
  assert.ok(predicate(), 'Expected Git snapshot before timeout');
}
