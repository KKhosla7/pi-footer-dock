import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { stripVTControlCharacters } from 'node:util';
import type { ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';
import { loadBranches } from '../src/adapters/git-branches.js';
import { branchLines } from '../src/core/branch-lines.js';
import { showBranches } from '../src/features/branches.js';
import { createBranchRepo, gitIn, isolatedGit } from './support/branch-repo.js';
import { quotaRoot } from './support/quota-fixtures.js';

Object.assign(process.env, isolatedGit);
const signal = () => AbortSignal.timeout(10_000);
const NOW = Date.parse('2024-02-01T12:00:00Z') / 1000;
const palette = { fg: (_colour: string, text: string) => text, bold: (text: string) => text };

async function loaded(cwd: string) {
  const result = await loadBranches(cwd, signal());
  assert.ok(result.ok, JSON.stringify(result));
  return result.list;
}
const summary = (list: Awaited<ReturnType<typeof loaded>>['locals']) =>
  list.map(
    (b) =>
      `${b.current ? '*' : ''}${b.name}` +
      (b.upstream
        ? `>${b.upstream.name}${b.upstream.gone ? ' gone' : ` +${b.upstream.ahead}-${b.upstream.behind}`}`
        : ''),
  );

await test('a real repository: current first, newest first, upstream ahead, behind and gone', (t) => {
  const { cwd } = createBranchRepo(t);
  return loaded(cwd).then((list) => {
    assert.deepEqual(summary(list.locals), [
      '*main>origin/main +0-0',
      'feature/ahead>origin/feature/ahead +1-0',
      'behind>origin/behind +0-1',
      'gone-up>origin/gone-up gone',
      'ünï/日本',
      '-x',
      'release/1.2',
    ]);
    assert.deepEqual(
      list.remotes.map((b) => b.name),
      ['origin/behind', 'origin/feature/ahead', 'origin/main'],
    );
    assert.equal(list.detached, false);
    assert.match(list.locals[0]?.hash ?? '', /^[0-9a-f]{7,}$/u);
    assert.equal(list.locals[0]?.time, Date.parse('2024-01-10T12:00:00Z') / 1000);
  });
});

await test('the rendered screen for that repository', async (t) => {
  const { cwd } = createBranchRepo(t);
  const result = await loadBranches(cwd, signal());
  const text = branchLines(result, palette, 100, NOW).join('\n');
  assert.match(text, /^Local branches \(7\)/u);
  assert.match(text, /\* main +[0-9a-f]{7,} +3 weeks ago +origin\/main {2}↑0 ↓0/u);
  assert.match(text, /feature\/ahead .*origin\/feature\/ahead {2}↑1 ↓0/u);
  assert.match(text, /behind .*origin\/behind {2}↑0 ↓1/u);
  assert.match(text, /origin\/gone-up \(gone\)/u);
  assert.match(text, /Remote branches \(3\) {2}as of last fetch, no network/u);
  assert.doesNotMatch(text, /origin\/HEAD/u);
});

await test('detached HEAD is reported', async (t) => {
  const { cwd, git } = createBranchRepo(t);
  git(undefined, 'checkout', '--detach');
  const list = await loaded(cwd);
  assert.equal(list.detached, true);
  const text = branchLines({ ok: true, list }, palette, 80, NOW).join('\n');
  assert.match(text, /HEAD is detached/u);
});

await test('no remotes: remote section says so', async (t) => {
  const root = quotaRoot(t);
  gitIn(root, undefined, 'init', '--template=', '-b', 'main');
  gitIn(root, '2024-01-01T12:00:00Z', 'commit', '--allow-empty', '-m', 'one');
  const list = await loaded(root);
  assert.equal(list.remotes.length, 0);
  assert.match(branchLines({ ok: true, list }, palette, 90, NOW).join('\n'), /No remote branches/u);
});

await test('an empty repository has no branches, a plain folder is not a repository', async (t) => {
  const root = quotaRoot(t);
  const empty = join(root, 'empty');
  const plain = join(root, 'plain');
  mkdirSync(empty);
  mkdirSync(plain);
  gitIn(empty, undefined, 'init', '--template=', '-b', 'main');
  assert.deepEqual(await loaded(empty), { locals: [], remotes: [], detached: false });
  process.env.GIT_CEILING_DIRECTORIES = root;
  try {
    assert.deepEqual(await loadBranches(plain, signal()), {
      ok: false,
      message: 'This folder is not a git repository.',
    });
  } finally {
    delete process.env.GIT_CEILING_DIRECTORIES;
  }
});

await test('git missing from PATH and a missing folder give a one-line message, not a throw', async (t) => {
  const { cwd } = createBranchRepo(t);
  const path = process.env.PATH;
  process.env.PATH = '';
  try {
    assert.deepEqual(await loadBranches(cwd, signal()), {
      ok: false,
      message: 'git is not installed or not on PATH.',
    });
  } finally {
    if (path !== undefined) process.env.PATH = path;
  }
  const missing = await loadBranches(join(cwd, 'nowhere'), signal());
  assert.equal(missing.ok, false);
  const aborted = await loadBranches(cwd, AbortSignal.abort());
  assert.equal(aborted.ok, false);
});

await test('showBranches loads once and opens the screen with that content', async (t) => {
  const { cwd } = createBranchRepo(t);
  const theme = {
    fg: (_c: string, text: string) => text,
    bold: (s: string) => s,
  } as unknown as Theme;
  let shown: string[] = [];
  const ctx = {
    cwd,
    ui: {
      custom: (factory: (...args: unknown[]) => { render(width: number): string[] }) => {
        shown = factory({ terminal: { rows: 40 } }, theme, undefined, () => undefined).render(100);
        return Promise.resolve();
      },
    },
  } as unknown as ExtensionContext;
  await showBranches(ctx);
  const text = shown.map((l) => stripVTControlCharacters(l)).join('\n');
  assert.match(text, /Footer Dock › Branches/u);
  assert.match(text, /\* main/u);
  assert.match(text, /Remote branches \(3\)/u);
});
