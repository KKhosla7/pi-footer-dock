import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { Theme } from '@earendil-works/pi-coding-agent';
import { visibleWidth } from '@earendil-works/pi-tui';
import { aheadFailure, readAhead } from '../src/adapters/git-ahead.js';
import { readGit } from '../src/adapters/git.js';
import { aheadLines } from '../src/core/ahead-lines.js';
import { DAY, EPOCH, commit, git, merge, pushedRepository } from './support/ahead-fixtures.js';
import { quotaRoot } from './support/quota-fixtures.js';

const theme = {
  fg: (_colour: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Pick<Theme, 'fg' | 'bold'>;
const now = (EPOCH + 10 * DAY) * 1000;
const read = (cwd: string) => readAhead(cwd, AbortSignal.timeout(5000));
const screen = (report: Awaited<ReturnType<typeof read>>, width = 80) =>
  aheadLines(report, { theme, width, now }).join('\n');

await test('ahead of a pushed upstream: counts, commits with stats, and the footer agrees', async (t) => {
  const { cwd } = pushedRepository(t);
  commit(cwd, 'Add two files', 3, { 'c.txt': '1\n2\n3\n', 'd.txt': 'd\n' });
  commit(cwd, 'Trim a.txt', 4, { 'a.txt': 'one\n' });
  commit(cwd, 'Add a logo', 5, { 'logo.bin': 'PNG\0\u0001\u0002' });
  git(cwd, 'checkout', '-q', '-b', 'side');
  commit(cwd, 'Side work', 6, { 's.txt': 's\n' });
  git(cwd, 'checkout', '-q', 'main');
  merge(cwd, 'side', 'Merge side', 7);
  const report = await read(cwd);
  assert.equal(report.counts?.ahead, 5);
  assert.equal((await readGit(cwd)).ahead, report.counts.ahead, 'the screen equals the footer');
  assert.deepEqual(
    report.ahead.map((c) => c.subject),
    ['Merge side', 'Side work', 'Add a logo', 'Trim a.txt', 'Add two files'],
  );
  assert.deepEqual(report.ahead[4]?.stat, { files: 2, added: 4, deleted: 0 });
  assert.deepEqual(report.ahead[3]?.stat, { files: 1, added: 0, deleted: 1 });
  assert.equal(report.ahead[0]?.stat, undefined, 'a merge has no stat');
  assert.equal(report.ahead[0]?.parents, 2);
  assert.equal(report.ahead[4].author, 'Ann Author');
  assert.equal(report.upstream?.name, 'origin/main');
  assert.equal(report.upstream.tip?.subject, 'Second pushed commit');
  const text = screen(report);
  assert.match(text, /Branch +main/u);
  assert.match(text, /Upstream +origin\/main/u);
  assert.match(text, /ahead 5 · behind 0/u);
  assert.match(text, /Commits ahead of origin\/main \(5\)/u);
  assert.match(text, /Ann Author · 1 week ago · 2 files \+4 −0/u);
  assert.match(text, /merge/u);
  for (const width of [80, 30])
    for (const line of screen(report, width).split('\n')) assert.ok(visibleWidth(line) <= width);
});

await test('nothing ahead, then behind after another clone pushes', async (t) => {
  const { cwd, origin, root } = pushedRepository(t);
  const first = await read(cwd);
  assert.equal(first.counts?.ahead, 0);
  assert.match(screen(first), /Nothing to push\./u);
  assert.equal((await readGit(cwd)).ahead, 0);
  const other = join(root, 'other');
  git(root, 'clone', '-q', origin, other);
  commit(other, 'Their change', 8, { 't.txt': 't\n' });
  git(other, 'push', '-q', 'origin', 'main');
  assert.equal(
    (await read(cwd)).counts?.behind,
    0,
    'no fetch yet: the screen is as of the last fetch',
  );
  git(cwd, 'fetch', '-q');
  commit(cwd, 'Mine', 9, { 'm.txt': 'm\n' });
  const report = await read(cwd);
  assert.deepEqual(report.counts, { ahead: 1, behind: 1 });
  assert.deepEqual(
    report.behind.map((c) => c.subject),
    ['Their change'],
  );
  assert.equal((await readGit(cwd)).ahead, 1);
  assert.deepEqual(report.behind[0]?.stat, { files: 1, added: 1, deleted: 0 });
  assert.match(screen(report), /Behind origin\/main \(1\)/u);
});

await test('more than 100 ahead lists 100 and says how many more', async (t) => {
  const { cwd } = pushedRepository(t);
  for (let day = 3; day < 106; day += 1) commit(cwd, `Commit ${day}`, day);
  const report = await read(cwd);
  assert.equal(report.counts?.ahead, 103);
  assert.equal(report.ahead.length, 100);
  assert.match(screen(report), /… 3 more/u);
  assert.equal((await readGit(cwd)).ahead, 103);
});

await test('no upstream: ahead is unknown, recent commits are context (max 10)', async (t) => {
  const root = quotaRoot(t);
  git(root, 'init', '-q', '-b', 'main');
  for (let day = 1; day <= 12; day += 1) commit(root, `Local ${day}`, day);
  const report = await read(root);
  assert.equal(report.upstream, undefined);
  assert.equal(report.counts, undefined);
  assert.equal(report.recent.length, 10);
  assert.equal((await readGit(root)).ahead, null, 'the footer also has no number');
  const text = screen(report);
  assert.match(text, /no upstream configured/u);
  assert.match(text, /Ahead is unknown, not zero\./u);
  assert.doesNotMatch(text, /Nothing to push/u);
});

await test('detached HEAD, a gone upstream and an empty repository', async (t) => {
  const { cwd, origin, root } = pushedRepository(t);
  git(cwd, 'push', '-q', 'origin', 'main:topic');
  git(cwd, 'branch', '-q', '--set-upstream-to=origin/topic');
  git(origin, 'branch', '-q', '-D', 'topic');
  git(cwd, 'fetch', '-q', '--prune');
  const gone = await read(cwd);
  assert.equal(gone.upstream?.name, 'origin/topic');
  assert.equal(gone.upstream.tip, undefined);
  assert.equal(gone.counts, undefined);
  assert.equal((await readGit(cwd)).ahead, null);
  assert.match(screen(gone), /origin\/topic \[gone\]/u);
  git(cwd, 'checkout', '-q', '--detach', 'HEAD~1');
  const detached = await read(cwd);
  assert.equal(detached.branch, null);
  assert.match(screen(detached), /detached HEAD at [0-9a-f]{7}/u);
  const empty = join(root, 'empty');
  mkdirSync(empty);
  git(empty, 'init', '-q', '-b', 'main');
  const none = await read(empty);
  assert.equal(none.head, undefined);
  assert.match(screen(none), /No commits yet\./u);
});

await test('a shallow clone says so', async (t) => {
  const { origin, root } = pushedRepository(t);
  const clone = join(root, 'shallow');
  git(root, 'clone', '-q', '--depth', '1', `file://${origin}`, clone);
  const report = await read(clone);
  assert.equal(report.shallow, true);
  assert.equal(report.counts?.ahead, 0);
  assert.match(screen(report), /Shallow clone/u);
});

await test('hostile commit text cannot reach the terminal', async (t) => {
  const { cwd } = pushedRepository(t);
  commit(cwd, '\u001b[31mred\u001b]0;pwned\u0007 ‮end ' + 'w'.repeat(5000), 3);
  const text = screen(await read(cwd), 40);
  assert.match(text, /red/u);
  const stripped = text.replaceAll('\u001b[0m', '');
  for (const bad of ['\u001b', '\u0007', '\u202e'])
    assert.ok(!stripped.includes(bad), "only pi-tui's own reset after an ellipsis may remain");
  for (const line of text.split('\n')) assert.ok(visibleWidth(line) <= 40);
});

await test('failures are one plain sentence: not a repository, git missing', async (t) => {
  const root = quotaRoot(t);
  const failure = await read(root).catch((error: unknown) => aheadFailure(error));
  assert.equal(failure, 'This folder is not inside a git repository.');
  const path = process.env.PATH;
  process.env.PATH = join(root, 'nothing');
  try {
    assert.equal(
      await read(root).catch((error: unknown) => aheadFailure(error)),
      'git is not installed or not on PATH.',
    );
  } finally {
    if (path === undefined) delete process.env.PATH;
    else process.env.PATH = path;
  }
  assert.equal(aheadFailure(new Error('x')), 'git could not be read.');
});

await test('only read-only git subcommands run, and nothing touches a remote', async (t) => {
  const { cwd, root } = pushedRepository(t);
  commit(cwd, 'Local', 3);
  const bin = join(root, 'bin');
  const log = join(root, 'git.log');
  mkdirSync(bin);
  const real = (process.env.PATH ?? '')
    .split(':')
    .map((dir) => join(dir, 'git'))
    .find((p) => {
      try {
        readFileSync(p);
        return true;
      } catch {
        return false;
      }
    });
  writeFileSync(join(bin, 'git'), `#!/bin/sh\necho "$@" >> '${log}'\nexec '${real}' "$@"\n`);
  chmodSync(join(bin, 'git'), 0o755);
  const path = process.env.PATH;
  process.env.PATH = `${bin}:${path ?? ''}`;
  try {
    await read(cwd);
  } finally {
    process.env.PATH = path ?? '';
  }
  const calls = readFileSync(log, 'utf8').trim().split('\n');
  assert.ok(calls.length >= 6);
  // `config` only lists settings (the guard reads them to switch off programs the repo asks for).
  const allowed = new Set([
    'symbolic-ref',
    'for-each-ref',
    'rev-parse',
    'rev-list',
    'log',
    'config',
  ]);
  for (const call of calls) {
    const words = call.split(' ');
    assert.equal(words[0], '--no-optional-locks');
    // Leading options are `-c key=value` pairs; the subcommand is the first word after them.
    let at = 1;
    while (words[at] === '-c') at += 2;
    const subcommand = words[at] ?? '';
    assert.ok(allowed.has(subcommand), call);
    if (subcommand !== 'config')
      assert.ok(words.includes('core.fsmonitor=false'), `guarded: ${call}`);
  }
});
