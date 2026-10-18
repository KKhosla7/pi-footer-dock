import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { MAX_DIFF_LINES, readFileDiff } from '../src/adapters/git-diff.js';
import { createGitRepository } from './support/git-fixtures.js';

async function text(
  cwd: string,
  path: string,
  status: 'M' | 'A' | 'D' | 'R' | '?',
): Promise<string> {
  const result = await readFileDiff(cwd, { path, status });
  assert.ok(result.ok, 'message' in result ? result.message : '');
  return result.lines.join('\n');
}

await test('a modified file shows its hunk against HEAD, staged and unstaged together', async () => {
  const repo = await createGitRepository();
  try {
    writeFileSync(join(repo.cwd, 'tracked.txt'), 'fixture\nstaged line\n');
    await repo.git('add', 'tracked.txt');
    writeFileSync(join(repo.cwd, 'tracked.txt'), 'fixture\nstaged line\nunstaged line\n');
    const diff = await text(repo.cwd, 'tracked.txt', 'M');
    assert.match(diff, /^diff --git a\/tracked\.txt b\/tracked\.txt/mu);
    assert.match(diff, /^@@ /mu);
    assert.match(diff, /^\+staged line$/mu);
    assert.match(diff, /^\+unstaged line$/mu);
  } finally {
    await repo.close();
  }
});

await test('an untracked file is shown whole as additions; a deleted one as removals; a new staged one as a new file', async () => {
  const repo = await createGitRepository();
  try {
    writeFileSync(join(repo.cwd, 'fresh.txt'), 'one\ntwo\n');
    const fresh = await text(repo.cwd, 'fresh.txt', '?');
    assert.match(fresh, /^\+one$/mu);
    assert.match(fresh, /^\+two$/mu);
    rmSync(join(repo.cwd, 'tracked.txt'));
    assert.match(await text(repo.cwd, 'tracked.txt', 'D'), /^-fixture$/mu);
    writeFileSync(join(repo.cwd, 'staged.txt'), 'new\n');
    await repo.git('add', 'staged.txt');
    assert.match(await text(repo.cwd, 'staged.txt', 'A'), /^new file mode/mu);
  } finally {
    await repo.close();
  }
});

await test('a renamed file, a binary file and a file that is no longer changed all give a sensible answer', async () => {
  const repo = await createGitRepository();
  try {
    renameSync(join(repo.cwd, 'tracked.txt'), join(repo.cwd, 'moved.txt'));
    await repo.git('add', '-A');
    assert.ok((await text(repo.cwd, 'moved.txt', 'R')).length > 0);
    writeFileSync(join(repo.cwd, 'blob.bin'), Buffer.from([0, 1, 2, 3, 0, 255]));
    assert.match(await text(repo.cwd, 'blob.bin', '?'), /Binary files .* differ/u);
    assert.equal(await text(repo.cwd, 'moved.txt', 'M').then((value) => value.length > 0), true);
    await repo.git('commit', '-m', 'move');
    assert.equal(
      await text(repo.cwd, 'moved.txt', 'M'),
      '',
      'nothing changed any more: an empty diff, not an error',
    );
  } finally {
    await repo.close();
  }
});

await test('a path that starts with a dash is a path, never an option', async () => {
  const repo = await createGitRepository();
  try {
    writeFileSync(join(repo.cwd, '--stat'), 'x\n');
    writeFileSync(join(repo.cwd, '-p'), 'y\n');
    assert.match(await text(repo.cwd, '--stat', '?'), /^\+x$/mu);
    assert.match(await text(repo.cwd, '-p', '?'), /^\+y$/mu);
  } finally {
    await repo.close();
  }
});

await test('a huge diff is cut to a bounded number of lines and says how many were left out', async () => {
  const repo = await createGitRepository();
  try {
    writeFileSync(
      join(repo.cwd, 'big.txt'),
      Array.from({ length: MAX_DIFF_LINES + 500 }, (_, index) => `line ${index}`).join('\n'),
    );
    const result = await readFileDiff(repo.cwd, { path: 'big.txt', status: '?' });
    assert.ok(result.ok);
    assert.equal(result.lines.length, MAX_DIFF_LINES);
    assert.ok(result.omitted > 400);
    writeFileSync(join(repo.cwd, 'enormous.txt'), 'x'.repeat(3 * 1024 * 1024));
    const refused = await readFileDiff(repo.cwd, { path: 'enormous.txt', status: '?' });
    assert.ok(!refused.ok);
    assert.match(refused.message, /too large/u);
  } finally {
    await repo.close();
  }
});

await test('outside a repository the answer is a message, not an exception', async () => {
  const result = await readFileDiff('/', { path: 'x', status: 'M' });
  assert.equal(result.ok, false);
});

await test('a repository that configures an external diff or a text conversion cannot make the diff run a program', async () => {
  const repo = await createGitRepository();
  try {
    const marker = join(repo.cwd, '.git', 'PWNED');
    const script = join(repo.cwd, '.git', 'run.sh');
    writeFileSync(script, `#!/bin/sh\necho ran > '${marker}'\ncat "$1"\n`);
    chmodSync(script, 0o755);
    await repo.git('config', 'diff.external', script);
    await repo.git('config', 'diff.hostile.textconv', script);
    writeFileSync(join(repo.cwd, '.gitattributes'), '*.txt diff=hostile\n');
    mkdirSync(join(repo.cwd, 'sub'));
    writeFileSync(join(repo.cwd, 'tracked.txt'), 'fixture\nchanged\n');
    writeFileSync(join(repo.cwd, 'sub', 'new.txt'), 'n\n');
    // The control: plain git in this repository does run the program, so the test can fail.
    await repo.git('diff', '--', 'tracked.txt').catch(() => undefined);
    assert.equal(existsSync(marker), true, 'plain git runs the configured program');
    rmSync(marker);
    await text(repo.cwd, 'tracked.txt', 'M');
    await text(repo.cwd, 'sub/new.txt', '?');
    assert.equal(existsSync(marker), false, 'no program from the repository ran');
  } finally {
    await repo.close();
  }
});
