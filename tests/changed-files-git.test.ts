import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, rename, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { stripVTControlCharacters } from 'node:util';
import { measureFile } from '../src/adapters/file-lines.js';
import { readChangedFiles } from '../src/adapters/git-changed-files.js';
import { readGit } from '../src/adapters/git.js';
import type { ChangedFile } from '../src/core/changed-files.js';
import { changedFilesLines } from '../src/ui/changed-files-view.js';
import { isolateGitConfig, tempRepository } from './support/changed-files-repo.js';
import { quotaRoot } from './support/quota-fixtures.js';

const execute = promisify(execFile);
const plain = { fg: (_colour: string, text: string) => text, bold: (text: string) => text };

async function files(cwd: string): Promise<ChangedFile[]> {
  const state = await readChangedFiles(cwd);
  if (state.kind !== 'files') throw new Error(`expected files, got ${state.kind}`);
  return state.files;
}
const byPath = (list: ChangedFile[], path: string) => list.find((file) => file.path === path);
const lines = (n: number) => Array.from({ length: n }, (_, i) => `line ${i + 1}\n`).join('');

const HOSTILE = 'ev\u001b[31mil\u0007\nname.txt';

/** A repository with one of every kind of change. */
async function mixedRepository(t: TestContext) {
  const { cwd, git, write } = await tempRepository(t);
  await write('a.txt', lines(5));
  await write('both.txt', 'one\ntwo\n');
  await write('gone.txt', 'x\ny\n');
  await write('old name.txt', lines(10));
  await write('bin.dat', Buffer.from([1, 2, 0, 3]));
  await git('add', '.');
  await git('commit', '-m', 'seed');
  await write('a.txt', 'line 1\nCHANGED\nline 3\nline 4\nline 5\nline 6\n'); // +2 -1
  await write('both.txt', 'one\ntwo\nthree\n');
  await git('add', 'both.txt');
  await write('both.txt', 'one\ntwo\nthree\nfour\n'); // staged and unstaged: one row
  await rm(join(cwd, 'gone.txt'));
  await git('mv', 'old name.txt', 'new ünï.txt');
  await write('bin.dat', Buffer.from([9, 0, 0, 0]));
  await write('untracked.txt', 'a\nb\nc'); // no trailing newline: 3 lines
  await write('deep/er/nested.txt', 'n\n'); // nested untracked
  await write('data.bin', Buffer.from([0, 1, 2]));
  await write(HOSTILE, 'x\n');
  await symlink('/etc/hostname', join(cwd, 'link'));
  return cwd;
}

await test('every kind of change is listed once, like the footer counts them, with counts', async (t) => {
  const cwd = await mixedRepository(t);
  const list = await files(cwd);
  assert.equal(list.length, (await readGit(cwd)).changed);
  assert.deepEqual(
    list.map((file) => file.path),
    [...list.map((file) => file.path)].sort(),
  );
  const row = (path: string) => {
    const found = byPath(list, path);
    assert.ok(found, `${path} is listed`);
    return [found.status, found.size.kind, found.added, found.removed];
  };
  assert.deepEqual(row('a.txt'), ['M', 'lines', 2, 1]);
  assert.deepEqual(byPath(list, 'a.txt')?.size, { kind: 'lines', lines: 6 });
  assert.deepEqual(row('both.txt'), ['M', 'lines', 2, 0]);
  assert.deepEqual(row('gone.txt'), ['D', 'deleted', 0, 2]);
  assert.deepEqual(row('new ünï.txt'), ['R', 'lines', 0, 0]);
  assert.equal(byPath(list, 'old name.txt'), undefined);
  assert.deepEqual(row('bin.dat'), ['M', 'binary', null, null]);
  assert.deepEqual(row('untracked.txt'), ['?', 'lines', 3, 0]);
  assert.deepEqual(byPath(list, 'untracked.txt')?.size, { kind: 'lines', lines: 3 });
  assert.deepEqual(row('deep/er/nested.txt'), ['?', 'lines', 1, 0]);
  assert.deepEqual(row('data.bin'), ['?', 'binary', null, null]);
  assert.deepEqual(row(HOSTILE), ['?', 'lines', 1, 0]);
  assert.deepEqual(row('link'), ['?', 'symlink', 1, 0]);
  const screen = changedFilesLines({ kind: 'files', files: list }, plain, 80).join('\n');
  assert.equal(screen.includes('\u001b'), false);
  assert.equal(screen.includes('\u0007'), false);
  assert.match(screen, /^ 10 files · \+10 −3/u);
  assert.match(screen, /A evilname\.txt/u, 'an untracked file reads as new');
  assert.match(screen, /M a\.txt +6 lines +\+2 −1/u);
});

await test('a subdirectory cwd lists repository-relative paths', async (t) => {
  const { cwd, git, write } = await tempRepository(t);
  await write('sub/dir/f.txt', 'a\n');
  await write('top.txt', 'a\n');
  await git('add', '.');
  await git('commit', '-m', 'seed');
  await write('sub/dir/f.txt', 'a\nb\n');
  await write('top.txt', 'a\nb\nc\n');
  const list = await files(join(cwd, 'sub', 'dir'));
  assert.deepEqual(
    list.map((file) => [file.path, file.added]),
    [
      ['sub/dir/f.txt', 1],
      ['top.txt', 2],
    ],
  );
});

await test('a repository with no commits uses the empty tree', async (t) => {
  const { cwd, git, write } = await tempRepository(t);
  assert.deepEqual(await files(cwd), []);
  await write('staged.txt', 'a\nb\n');
  await git('add', 'staged.txt');
  await write('loose.txt', 'z\n');
  const list = await files(cwd);
  assert.deepEqual(
    list.map((file) => [file.path, file.status, file.added, file.removed]),
    [
      ['loose.txt', '?', 1, 0],
      ['staged.txt', 'A', 2, 0],
    ],
  );
});

await test('a clean tree, no repository and no git are explicit states', async (t) => {
  const { cwd, git, write } = await tempRepository(t);
  await write('a.txt', 'a\n');
  await git('add', '.');
  await git('commit', '-m', 'seed');
  assert.deepEqual(await readChangedFiles(cwd), { kind: 'files', files: [] });
  assert.deepEqual(changedFilesLines({ kind: 'files', files: [] }, plain, 40), [' No changes']);
  assert.deepEqual(await readChangedFiles(quotaRoot(t)), { kind: 'not-repository' });
  const path = process.env.PATH;
  process.env.PATH = join(quotaRoot(t), 'nothing-here');
  try {
    assert.deepEqual(await readChangedFiles(cwd), { kind: 'git-missing' });
  } finally {
    if (path === undefined) delete process.env.PATH;
    else process.env.PATH = path;
  }
});

await test('large and symlinked files are labelled, never read', async (t) => {
  const { cwd, git, write } = await tempRepository(t);
  await write('seed.txt', 'a\n');
  await git('add', '.');
  await git('commit', '-m', 'seed');
  await write('huge.txt', 'x\n'.repeat(1_100_000)); // 2.2 MB
  const outside = join(quotaRoot(t), 'outside');
  await mkdir(outside);
  await write('../outside/secret.txt', 'one\ntwo\n');
  await symlink(outside, join(cwd, 'dirlink'));
  const list = await files(cwd);
  assert.deepEqual(byPath(list, 'huge.txt')?.size, { kind: 'large' });
  assert.equal(byPath(list, 'huge.txt')?.added, null);
  assert.equal(byPath(list, 'dirlink')?.size.kind, 'symlink');
  assert.equal(list.length, 2);
});

await test('measureFile stays inside the repository and survives races', async (t) => {
  const { cwd, write } = await tempRepository(t);
  const budget = () => ({ bytes: 1024, deadline: AbortSignal.timeout(1000) });
  const outside = join(quotaRoot(t), 'outside');
  await mkdir(outside);
  await write('../outside/secret.txt', 'one\ntwo\n');
  await symlink(outside, join(cwd, 'dirlink'));
  await write('real.txt', 'one\ntwo\n');
  await write('empty.txt', '');
  await write('nonl.txt', 'abc');
  assert.deepEqual(await measureFile(cwd, 'dirlink/secret.txt', budget()), { kind: 'unreadable' });
  assert.deepEqual(await measureFile(cwd, '../outside/secret.txt', budget()), {
    kind: 'unreadable',
  });
  assert.deepEqual(await measureFile(cwd, '/etc/hostname', budget()), { kind: 'unreadable' });
  assert.deepEqual(await measureFile(cwd, 'real.txt', budget()), { kind: 'lines', lines: 2 });
  assert.deepEqual(await measureFile(cwd, 'empty.txt', budget()), { kind: 'lines', lines: 0 });
  assert.deepEqual(await measureFile(cwd, 'nonl.txt', budget()), { kind: 'lines', lines: 1 });
  assert.deepEqual(await measureFile(cwd, 'nope/missing.txt', budget()), { kind: 'deleted' });
  await rename(join(cwd, 'real.txt'), join(cwd, 'moved.txt'));
  assert.deepEqual(await measureFile(cwd, 'real.txt', budget()), { kind: 'deleted' });
  assert.deepEqual(
    await measureFile(cwd, 'real.txt', { bytes: 0, deadline: AbortSignal.abort() }),
    {
      kind: 'deleted',
    },
  );
  assert.deepEqual(await measureFile(cwd, 'moved.txt', { bytes: 1, deadline: budget().deadline }), {
    kind: 'skipped',
  });
});

await test('more than 300 files: 300 rows, a "more" line, totals cover all', async (t) => {
  const { cwd, write } = await tempRepository(t);
  for (let index = 0; index < 305; index += 1)
    await write(`f/${String(index).padStart(3, '0')}.txt`, 'a\nb\n');
  const state = await readChangedFiles(cwd);
  assert.equal(state.kind, 'files');
  const out = changedFilesLines(state, plain, 70).map((line) => stripVTControlCharacters(line));
  assert.equal(out[0], ' 305 files · +610 −0 ■■■■■');
  assert.equal(
    out.length,
    1 + 1 + 300 + 1 + 2,
    'header, blank, 300 rows, "more", blank and legend',
  );
  assert.equal(out.at(-3), ' … 5 more');
  assert.match(out.at(-1) ?? '', /A new/u);
});

await test('submodules and nested repositories are rows without counts', async (t) => {
  const { cwd, write } = await tempRepository(t);
  isolateGitConfig(t);
  await write('inner/readme.txt', 'x\n');
  await execute('git', ['init', '--template=', '-q'], { cwd: join(cwd, 'inner') });
  const list = await files(cwd);
  assert.equal(list.length, (await readGit(cwd)).changed);
  assert.equal(byPath(list, 'inner/')?.size.kind, 'directory');
  assert.equal(byPath(list, 'inner/')?.added, null);
});
