import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { parseGitStatus, readGit, unknownGit } from '../src/adapters/git.js';

const exec = promisify(execFile);

await test('porcelain v2 counts rename once and does not parse its source path as a record', () => {
  const data =
    '# branch.head main\0# branch.ab +3 -1\0' +
    '1 M. N... fields file\0? untracked\0' +
    '2 R. N... fields new name\0? source-path\0';
  assert.deepEqual(parseGitStatus(data), { branch: 'main', changed: 3, ahead: 3 });
  assert.deepEqual(parseGitStatus('# branch.head (detached)\0'), {
    branch: '(detached)',
    changed: 0,
    ahead: null,
  });
});

await test('live Git: unborn branch, untracked files, no upstream, and no repository', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-footer-dock-git-'));
  try {
    assert.deepEqual(await readGit(cwd), unknownGit);
    await exec('git', ['init', '-b', 'main'], { cwd });
    assert.deepEqual(await readGit(cwd), { branch: 'main', changed: 0, ahead: null });
    await writeFile(join(cwd, 'file\nwith-newline.txt'), 'fixture');
    assert.deepEqual(await readGit(cwd), { branch: 'main', changed: 1, ahead: null });
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

await test('live Git counts nested untracked files individually, excludes ignored files and counts a staged/unstaged path once', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-footer-dock-git-files-'));
  try {
    await exec('git', ['init', '-b', 'main'], { cwd });
    await mkdir(join(cwd, 'nested/deeper'), { recursive: true });
    await writeFile(join(cwd, '.gitignore'), '*.ignored\n');
    await writeFile(join(cwd, 'nested/a'), 'fixture');
    await writeFile(join(cwd, 'nested/deeper/b\nnewline'), 'fixture');
    await writeFile(join(cwd, 'nested/c.ignored'), 'excluded');
    await symlink('nested', join(cwd, 'link'));
    assert.equal((await readGit(cwd)).changed, 4);
    await exec('git', ['add', '--', 'nested/a'], { cwd });
    await writeFile(join(cwd, 'nested/a'), 'changed after stage');
    assert.equal((await readGit(cwd)).changed, 4);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

await test('aborted/error Git is unknown rather than a fabricated clean zero', async () => {
  const controller = new AbortController();
  controller.abort();
  assert.deepEqual(await readGit('/not/a/directory', controller.signal), unknownGit);
});
