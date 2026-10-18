import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { showChangedFiles } from '../src/features/changed-files.js';
import { closeInfoScreen } from '../src/ui/info-screen.js';
import { createGitRepository } from './support/git-fixtures.js';
import { fakeContext } from './support/screen-harness.js';

await test('while the list is open, files that change appear by themselves, with the cursor and search kept', async () => {
  const repo = await createGitRepository();
  try {
    writeFileSync(join(repo.cwd, 'tracked.txt'), 'fixture\nchanged\n');
    const world = fakeContext(repo.cwd);
    const flow = showChangedFiles(world.ctx);
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.match(world.text(), /1 file ·/u);
    assert.doesNotMatch(world.text(), /later\.txt/u);
    writeFileSync(join(repo.cwd, 'later.txt'), 'new\n');
    writeFileSync(join(repo.cwd, 'tracked.txt'), 'fixture\nchanged\nmore\n');
    for (let attempt = 0; attempt < 100 && !world.text().includes('2 files ·'); attempt += 1)
      await new Promise((resolve) => setTimeout(resolve, 100));
    assert.match(world.text(), /2 files ·/u, 'the new file is counted without closing the screen');
    assert.match(world.text(), /later\.txt/u);
    assert.match(
      world.text(),
      /tracked\.txt\s+3 lines\s+\+2/u,
      'and more lines in a file already listed',
    );
    closeInfoScreen();
    await flow;
  } finally {
    await repo.close();
  }
});
