import assert from 'node:assert/strict';
import { stripVTControlCharacters } from 'node:util';
import { test } from 'node:test';
import { visibleWidth } from '@earendil-works/pi-tui';
import { branchLines, SECTION_LIMIT } from '../src/core/branch-lines.js';
import type { Palette } from '../src/core/branch-lines.js';
import { parseBranches } from '../src/core/branches.js';
import type { BranchList } from '../src/core/branches.js';
import { relativeAge } from '../src/core/relative-age.js';

const US = '\u001f';
function record(
  ref: string,
  options: { head?: boolean; time?: string; up?: string; track?: string; symref?: string } = {},
): string {
  const { head = false, time = '1700000000', up = '', track = '', symref = '' } = options;
  return [head ? '*' : ' ', ref, 'abc1234', time, up, track, symref].join(US);
}
const parse = (...records: string[]) => parseBranches(records.join('\n') + '\n');

await test('local branches: the current one first, then newest commit first', () => {
  const list = parse(
    record('refs/heads/old', { time: '100' }),
    record('refs/heads/new', { time: '300' }),
    record('refs/heads/main', { time: '200', head: true }),
  );
  assert.deepEqual(
    list.locals.map((b) => b.name),
    ['main', 'new', 'old'],
  );
  assert.equal(list.locals[0]?.current, true);
  assert.equal(list.detached, false);
});

await test('awkward names survive: slashes, unicode, a leading dash, an equal time sorts by name', () => {
  const list = parse(
    record('refs/heads/release/1.2'),
    record('refs/heads/-x'),
    record('refs/heads/ünï/日本'),
    record('refs/remotes/origin/feature/a-b'),
  );
  assert.deepEqual(
    list.locals.map((b) => b.name),
    ['-x', 'release/1.2', 'ünï/日本'],
  );
  assert.deepEqual(
    list.remotes.map((b) => b.name),
    ['origin/feature/a-b'],
  );
});

await test('the upstream track forms become ahead, behind and gone', () => {
  const cases: [string, number, number, boolean][] = [
    ['[ahead 1]', 1, 0, false],
    ['[behind 2]', 0, 2, false],
    ['[ahead 1, behind 2]', 1, 2, false],
    ['[gone]', 0, 0, true],
    ['', 0, 0, false],
  ];
  for (const [track, ahead, behind, gone] of cases) {
    const upstream = parse(record('refs/heads/a', { up: 'origin/a', track })).locals[0]?.upstream;
    assert.deepEqual(upstream, { name: 'origin/a', ahead, behind, gone }, track);
  }
  assert.equal(parse(record('refs/heads/a')).locals[0]?.upstream, undefined);
});

await test('a symbolic remote HEAD, other refs and malformed lines are ignored', () => {
  const list = parseBranches(
    [
      record('refs/remotes/origin/HEAD', { symref: 'refs/remotes/origin/main' }),
      record('refs/remotes/origin/main'),
      record('refs/tags/v1'),
      'garbage',
      '',
      record('refs/heads/', { time: '1' }),
    ].join('\n'),
  );
  assert.deepEqual(
    list.remotes.map((b) => b.name),
    ['origin/main'],
  );
  assert.equal(list.locals.length, 0);
});

await test('detached HEAD: local branches exist but none is current; empty output is no branches', () => {
  assert.equal(parse(record('refs/heads/main')).detached, true);
  assert.deepEqual(parseBranches(''), { locals: [], remotes: [], detached: false });
  assert.equal(parse(record('refs/remotes/origin/main')).detached, false);
});

await test('a missing or invalid time is unknown, not NaN', () => {
  const list = parse(record('refs/heads/a', { time: '' }), record('refs/heads/b', { time: 'x' }));
  assert.deepEqual(
    list.locals.map((b) => b.time),
    [undefined, undefined],
  );
  assert.equal(relativeAge(undefined, 5), 'unknown');
});

await test('relative age uses the largest whole unit', () => {
  const now = 10_000_000;
  assert.equal(relativeAge(now, now), 'just now');
  assert.equal(relativeAge(now + 99, now), 'just now');
  assert.equal(relativeAge(now - 60, now), '1 minute ago');
  assert.equal(relativeAge(now - 3 * 3600, now), '3 hours ago');
  assert.equal(relativeAge(now - 86_400, now), '1 day ago');
  assert.equal(relativeAge(now - 15 * 86_400, now), '2 weeks ago');
  assert.equal(relativeAge(now - 400 * 86_400, now), '1 year ago');
});

const palette: Palette = {
  fg: (colour, text) => `\u001b[${colour.length}m${text}\u001b[0m`,
  bold: (text) => `\u001b[1m${text}\u001b[22m`,
};
const plain = (lines: string[]) => lines.map((l) => stripVTControlCharacters(l));
const render = (list: BranchList, width = 80) =>
  plain(branchLines({ ok: true, list }, palette, width, 1_700_000_000 + 86_400));

await test('the screen lists both sections, the current branch marked, with ahead and behind', () => {
  const lines = render(
    parse(
      record('refs/heads/main', { head: true, up: 'origin/main', track: '[ahead 1]' }),
      record('refs/heads/topic', { time: '1', up: 'origin/topic', track: '[gone]' }),
      record('refs/remotes/origin/main'),
    ),
  );
  const text = lines.join('\n');
  assert.match(text, /Local branches \(2\)/u);
  assert.match(text, /Remote branches \(1\) {2}as of last fetch, no network/u);
  assert.match(lines[1] ?? '', /^ \* main +abc1234 +1 day ago +origin\/main {2}↑1 ↓0$/u);
  assert.match(lines[2] ?? '', /^ {3}topic +abc1234 .*origin\/topic \(gone\)$/u);
});

await test('detached HEAD, no remotes and an empty repository are said plainly', () => {
  const detached = render(parse(record('refs/heads/main'))).join('\n');
  assert.match(detached, /HEAD is detached/u);
  assert.match(detached, /No remote branches: no remote is configured/u);
  const empty = render(parseBranches('')).join('\n');
  assert.match(empty, /no commits/u);
  assert.equal(plain(branchLines({ ok: false, message: 'Nope.' }, palette, 40, 0)).join(), 'Nope.');
});

await test('each section is capped at 100 entries with a count of the rest', () => {
  const records = Array.from({ length: 130 }, (_, i) => record(`refs/remotes/origin/b${i}`));
  const lines = render(parse(...records));
  assert.equal(lines.filter((l) => l.includes('abc1234')).length, SECTION_LIMIT);
  assert.ok(lines.includes('  … 30 more'));
  assert.match(lines.join('\n'), /Remote branches \(130\)/u);
});

await test('hostile names carry no terminal controls and every line fits the width', () => {
  const evil = 'refs/heads/\u001b[31mred\u001b]0;title\u0007‮evil/' + '日本語'.repeat(30);
  const list = parse(record(evil, { head: true, up: 'origin/\u001b[2Jx', track: '[ahead 3]' }));
  for (const width of [1, 10, 24, 50, 120]) {
    const lines = branchLines({ ok: true, list }, palette, width, 1_700_000_000);
    for (const line of lines) {
      assert.ok(visibleWidth(line) <= width, `width ${width}: ${line}`);
      assert.doesNotMatch(stripVTControlCharacters(line), /[\p{Cc}\p{Cf}]/u);
    }
  }
  const bare: Palette = { fg: (_colour, text) => text, bold: (text) => text };
  const text = stripVTControlCharacters(branchLines({ ok: true, list }, bare, 50, 0).join(''));
  assert.doesNotMatch(text, /[\p{Cc}\p{Cf}]/u);
  assert.match(text, /^Local branches \(1\) \* /u);
});
