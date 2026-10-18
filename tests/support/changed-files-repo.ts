import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { TestContext } from 'node:test';
import { promisify } from 'node:util';
import { quotaRoot } from './quota-fixtures.js';

const execute = promisify(execFile);
const isolated = {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_TERMINAL_PROMPT: '0',
};

/** Points the code under test at no user or system Git configuration for the whole test. */
export function isolateGitConfig(t: TestContext): void {
  const before = Object.fromEntries(Object.keys(isolated).map((key) => [key, process.env[key]]));
  Object.assign(process.env, isolated);
  t.after(() => {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = value;
    }
  });
}

/** An empty temporary repository (`main`, no commits) with a helper to run Git and write files. */
export async function tempRepository(t: TestContext) {
  isolateGitConfig(t);
  const cwd = join(quotaRoot(t), 'repo');
  await mkdir(cwd);
  const git = async (...args: string[]): Promise<string> =>
    (
      await execute(
        'git',
        ['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', ...args],
        { cwd, env: { ...process.env, ...isolated } },
      )
    ).stdout;
  const write = async (name: string, content: string | Buffer): Promise<void> => {
    await mkdir(dirname(join(cwd, name)), { recursive: true });
    await writeFile(join(cwd, name), content);
  };
  await git('init', '--template=', '-b', 'main');
  return { cwd, git, write };
}
