import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { readAheadReport } from './support/git-inert-readers.js';
import { gitOutput } from '../src/adapters/git-command.js';
import { forgetInert, inertArguments, inertOverrides } from '../src/adapters/git-inert.js';
import { readGit } from '../src/adapters/git.js';
import { quotaRoot } from './support/quota-fixtures.js';

const ENV = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };
const git = (cwd: string, ...args: string[]): string =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd,
    env: { ...process.env, ...ENV },
    encoding: 'utf8',
  });
/** `scope NUL key NEWLINE value NUL`, as `git config --list --show-scope -z` prints it. */
const entry = (scope: string, key: string, value = 'x'): string => `${scope}\0${key}\n${value}\0`;

/** A repository whose own config tries to run a program every time git reads it. */
function hostileRepository(t: TestContext): { dir: string; marker: string } {
  const dir = quotaRoot(t);
  git(dir, 'init', '-q');
  writeFileSync(join(dir, 'a.txt'), 'a\n');
  git(dir, 'add', 'a.txt');
  git(dir, 'commit', '-q', '-m', 'init');
  const marker = join(dir, '.git', 'PWNED');
  const script = join(dir, '.git', 'fsmonitor.sh');
  writeFileSync(script, `#!/bin/sh\necho ran > '${marker}'\nprintf '\\0'\n`);
  chmodSync(script, 0o755);
  git(dir, 'config', 'core.fsmonitor', script);
  writeFileSync(join(dir, 'a.txt'), 'a\nchanged\n');
  return { dir, marker };
}
const signal = () => AbortSignal.timeout(8000);

await test('the control: plain git in such a repository DOES run the program (so the tests below can fail)', (t) => {
  const { dir, marker } = hostileRepository(t);
  git(dir, 'status', '--porcelain');
  assert.ok(existsSync(marker), 'git ran the repository-supplied fsmonitor program');
});

await test("every way the extension reads git leaves the repository's program unrun, and still reads correctly", async (t) => {
  const { dir, marker } = hostileRepository(t);
  const previous = { ...process.env };
  Object.assign(process.env, ENV);
  forgetInert();
  try {
    const state = await readGit(dir, signal());
    assert.equal(state.changed, 1, 'the change is still seen');
    assert.match(await gitOutput(dir, ['status', '--porcelain'], signal()), /a\.txt/u);
    assert.ok((await readAheadReport(dir, signal())).branch, 'the ahead reader works too');
    assert.ok(!existsSync(marker), 'the repository program never ran');
  } finally {
    process.env = previous;
    forgetInert();
    rmSync(marker, { force: true });
  }
});

await test("program-running keys of the repository config are switched off; the user's own are kept", () => {
  const list = [
    entry('system', 'filter.lfs.clean', 'git-lfs clean'),
    entry('global', 'filter.lfs.smudge', 'git-lfs smudge'),
    entry('global', 'core.pager', 'less'),
    entry('local', 'core.fsmonitor', '/x'),
    entry('local', 'filter.evil.clean', 'sh -c x'),
    entry('local', 'filter.evil.PROCESS', 'p'),
    entry('worktree', 'diff.pdf.textconv', 'pdftotext'),
    entry('local', 'diff.external', 'ext'),
    entry('local', 'merge.driver.driver', 'd'),
    entry('local', 'gpg.ssh.program', 'g'),
    entry('local', 'credential.https://x.helper', 'h'),
    entry('local', 'core.sshCommand', 's'),
    entry('local', 'user.name', 'harmless'),
    entry('local', 'core.filemode', 'true'),
    entry('local', 'filter.evil.required', 'true'),
  ].join('');
  assert.deepEqual(
    inertOverrides(list).filter((_, index) => index % 2 === 1),
    [
      'core.fsmonitor=',
      'filter.evil.clean=',
      'filter.evil.PROCESS=',
      'diff.pdf.textconv=',
      'diff.external=',
      'merge.driver.driver=',
      'gpg.ssh.program=',
      'credential.https://x.helper=',
      'core.sshCommand=',
    ],
  );
});

await test('hostile or truncated config output never throws and never invents an override', () => {
  assert.deepEqual(inertOverrides(''), []);
  assert.deepEqual(inertOverrides('local'), []);
  assert.deepEqual(inertOverrides('local\0'), []);
  assert.deepEqual(
    inertOverrides('garbage\0core.fsmonitor\nx\0'),
    [],
    'an unknown scope is not the repository',
  );
  assert.deepEqual(inertOverrides(entry('local', 'core.fsmonitor\nx=1 -c evil=1')), [
    '-c',
    'core.fsmonitor=',
  ]);
});

await test('a filter defined by the repository is switched off for real, and a global one is not touched', async (t) => {
  const dir = quotaRoot(t);
  git(dir, 'init', '-q');
  const marker = join(dir, 'FILTER-RAN');
  git(dir, 'config', 'filter.evil.clean', `sh -c "touch '${marker}'; cat"`);
  const global = join(dir, 'global-config');
  writeFileSync(global, '[filter "lfs"]\n\tclean = git-lfs clean\n');
  const previous = { ...process.env };
  Object.assign(process.env, { GIT_CONFIG_GLOBAL: global, GIT_CONFIG_SYSTEM: '/dev/null' });
  forgetInert();
  try {
    const args = await inertArguments(dir, signal());
    assert.ok(args.includes('filter.evil.clean='), 'the repository filter is overridden');
    assert.ok(!args.some((arg) => arg.startsWith('filter.lfs')), "the user's filter is left alone");
    assert.deepEqual(args.slice(0, 2), ['-c', 'core.fsmonitor=false'], 'fsmonitor is always off');
  } finally {
    process.env = previous;
    forgetInert();
  }
});
