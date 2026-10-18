import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { switchCommand } from '../src/core/branch-switch.js';
import { showBranches } from '../src/features/branches.js';
import { showChangedFiles } from '../src/features/changed-files.js';
import { closeInfoScreen } from '../src/ui/info-screen.js';
import { createGitRepository } from './support/git-fixtures.js';
import { fakeContext } from './support/screen-harness.js';

const none = new Set<string>();

await test('the switch command is built only from safe names, quoted by construction, and never for the branch you are on', () => {
  assert.deepEqual(switchCommand({ name: 'feature/x-1', remote: false, current: false }, none), {
    ok: true,
    command: '!git switch -- feature/x-1',
  });
  assert.deepEqual(
    switchCommand({ name: 'origin/feature/y', remote: true, current: false }, none),
    { ok: true, command: '!git switch --track -- origin/feature/y' },
  );
  assert.deepEqual(
    switchCommand(
      { name: 'origin/feature/y', remote: true, current: false },
      new Set(['feature/y']),
    ),
    { ok: true, command: '!git switch -- feature/y' },
  );
  assert.equal(switchCommand({ name: 'main', remote: false, current: true }, none).ok, false);
  for (const hostile of [
    "x'; rm -rf ~; '",
    'a b',
    '$(touch pwned)',
    'a`b`',
    'x\nrm',
    '-oops',
    'a;b',
    'a|b',
    'a&b',
    'a>b',
    'é',
    '',
  ])
    assert.equal(
      switchCommand({ name: hostile, remote: false, current: false }, none).ok,
      false,
      JSON.stringify(hostile),
    );
});

await test('the commands it builds really work in git: --track creates the local branch, a plain name switches', async () => {
  const repo = await createGitRepository();
  try {
    await repo.git('branch', 'feature/a');
    await repo.git('push', 'origin', 'feature/a');
    execFileSync('git', ['branch', '-D', 'feature/a'], { cwd: repo.cwd });
    await repo.git('fetch', 'origin');
    const track = switchCommand({ name: 'origin/feature/a', remote: true, current: false }, none);
    assert.ok(track.ok);
    execFileSync('git', track.command.slice(5).split(' '), { cwd: repo.cwd });
    assert.equal(
      execFileSync('git', ['branch', '--show-current'], { cwd: repo.cwd, encoding: 'utf8' }).trim(),
      'feature/a',
    );
    const back = switchCommand({ name: 'main', remote: false, current: false }, none);
    assert.ok(back.ok);
    execFileSync('git', back.command.slice(5).split(' '), { cwd: repo.cwd });
    assert.equal(
      execFileSync('git', ['branch', '--show-current'], { cwd: repo.cwd, encoding: 'utf8' }).trim(),
      'main',
    );
  } finally {
    await repo.close();
  }
});

await test('choosing a branch puts the command in the editor and runs nothing; a draft is never overwritten', async () => {
  const repo = await createGitRepository();
  try {
    await repo.git('branch', 'other');
    const world = fakeContext(repo.cwd);
    const flow = showBranches(world.ctx);
    await new Promise((resolve) => setTimeout(resolve, 400));
    assert.match(world.text(), /Local branches \(2\)[\s\S]*Remote branches/u);
    assert.match(world.text(), /→ .*\* main/u, 'the cursor starts on the current branch');
    await world.press(...Array.from('other'), '\r');
    await flow;
    assert.deepEqual(world.log.set, ['!git switch -- other']);
    assert.match(world.log.notices.join('\n'), /Nothing has run yet/u);
    assert.equal(
      execFileSync('git', ['branch', '--show-current'], { cwd: repo.cwd, encoding: 'utf8' }).trim(),
      'main',
      'nothing was switched',
    );
    const draft = fakeContext(repo.cwd, 'half a message');
    const second = showBranches(draft.ctx);
    await new Promise((resolve) => setTimeout(resolve, 400));
    await draft.press(...Array.from('other'), '\r');
    await second;
    assert.deepEqual(draft.log.set, []);
    assert.match(draft.log.notices.join('\n'), /Clear it/u);
  } finally {
    await repo.close();
  }
});

await test('the changed files list has a cursor and search; Enter shows the diff; Esc returns to the same row; the icon closes it all', async () => {
  const repo = await createGitRepository();
  try {
    mkdirSync(join(repo.cwd, 'src'));
    writeFileSync(join(repo.cwd, 'src', 'a.ts'), 'a\n');
    writeFileSync(join(repo.cwd, 'src', 'b.ts'), 'b1\nb2\n');
    writeFileSync(join(repo.cwd, 'tracked.txt'), 'fixture\nchanged\n');
    const world = fakeContext(repo.cwd);
    const flow = showChangedFiles(world.ctx);
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.match(world.text(), /3 files · \+\d+ −\d+ [■]{5}/u);
    assert.match(world.text(), /Search/u);
    await world.press(...Array.from('b.ts'));
    assert.doesNotMatch(world.text(), /src\/a\.ts/u);
    await world.press('\r');
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.equal(world.screens.length, 2, 'the diff opened as a screen of its own');
    assert.match(world.text(), /Changed files › Diff/u);
    assert.match(world.text(), /^ +1 \+b1$/mu, 'the new-file line number in the margin');
    assert.match(world.text(), /^ +2 \+b2$/mu);
    assert.match(world.text(), /Changed lines: 1–2/u);
    assert.match(world.text(), /First change: src\/b\.ts:1/u);
    await world.press('\u001b');
    await new Promise((resolve) => setTimeout(resolve, 100));
    assert.equal(world.screens.length, 3, 'Esc came back to the list');
    assert.match(world.text(), /→ .*b\.ts/u, 'on the same row');
    closeInfoScreen();
    await flow;
    assert.equal(
      world.screens.length,
      3,
      'closing from its icon ends the whole flow, it does not reopen',
    );
  } finally {
    await repo.close();
  }
});

await test('closing the diff from the icon ends the flow too, and Esc on the list ends it quietly', async () => {
  const repo = await createGitRepository();
  try {
    writeFileSync(join(repo.cwd, 'tracked.txt'), 'fixture\nchanged\n');
    const world = fakeContext(repo.cwd);
    const flow = showChangedFiles(world.ctx);
    await new Promise((resolve) => setTimeout(resolve, 500));
    await world.press('\r');
    await new Promise((resolve) => setTimeout(resolve, 300));
    assert.match(world.text(), /Diff/u);
    closeInfoScreen();
    await flow;
    assert.equal(world.screens.length, 2);
    const again = fakeContext(repo.cwd);
    const quiet = showChangedFiles(again.ctx);
    await new Promise((resolve) => setTimeout(resolve, 500));
    await again.press('\u001b');
    await quiet;
    assert.equal(again.screens.length, 1);
  } finally {
    await repo.close();
  }
});
