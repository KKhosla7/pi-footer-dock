import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Theme } from '@earendil-works/pi-coding-agent';
import { visibleWidth } from '@earendil-works/pi-tui';
import { aheadLines } from '../src/core/ahead-lines.js';
import { parseCommits, parseCounts, parseStat, relativeTime } from '../src/core/ahead-parse.js';
import type { AheadReport, CommitInfo } from '../src/core/ahead-parse.js';

const record = (
  hash: string,
  parents: string,
  who: [author: string, when: number],
  subject: string,
) => `\0${hash}\x1f${parents}\x1f${who[0]}\x1f${who[1]}\x1f${subject}\n`;

await test('shortstat forms: both, singular insertion only, deletions only, none', () => {
  assert.deepEqual(parseStat(' 3 files changed, 42 insertions(+), 7 deletions(-)\n'), {
    files: 3,
    added: 42,
    deleted: 7,
  });
  assert.deepEqual(parseStat(' 1 file changed, 2 insertions(+)\n'), {
    files: 1,
    added: 2,
    deleted: 0,
  });
  assert.deepEqual(parseStat(' 1 file changed, 3 deletions(-)\n'), {
    files: 1,
    added: 0,
    deleted: 3,
  });
  assert.deepEqual(parseStat(' 1 file changed, 1 insertion(+), 1 deletion(-)\n'), {
    files: 1,
    added: 1,
    deleted: 1,
  });
  assert.equal(parseStat('\n'), undefined, 'a binary-only or empty commit prints no stat line');
  assert.deepEqual(parseStat(' 2 Dateien geändert, 5 Einfügungen(+), 1 Löschung(-)\n'), {
    files: 2,
    added: 5,
    deleted: 1,
  });
});

await test('log records: with stat, merge without stat, binary-only without stat, the last record without a newline', () => {
  const raw =
    record('aaaa111', 'bbbb222', ['Ann', 1000], 'Add thing') +
    '\n 2 files changed, 4 insertions(+), 1 deletion(-)\n' +
    record('cccc333', 'dddd444 eeee555', ['Bob', 900], 'Merge branch x') +
    record('ffff666', 'aaaa000', ['Cy', 800], 'Add logo.png') +
    '\0abcd777\x1f\x1fDi\x1f700\x1fRoot';
  const commits = parseCommits(raw);
  assert.deepEqual(
    commits.map((c) => [c.hash, c.parents, c.author, c.when, c.subject, c.stat]),
    [
      ['aaaa111', 1, 'Ann', 1000, 'Add thing', { files: 2, added: 4, deleted: 1 }],
      ['cccc333', 2, 'Bob', 900, 'Merge branch x', undefined],
      ['ffff666', 1, 'Cy', 800, 'Add logo.png', undefined],
      ['abcd777', 0, 'Di', 700, 'Root', undefined],
    ],
  );
});

await test('hostile and malformed records are cleaned or dropped, never thrown on', () => {
  const evil = '\u001b[31mred\u001b]0;pwned\u0007‮ text\u0001 \x1fwith separator';
  const [commit, ...rest] = parseCommits(
    record('abcd123', 'a', ['E\u001bvil', 5], evil) +
      '\0not-a-hash\x1fx\x1fy\x1f1\x1fz\n\0short\x1f1\n' +
      'noise',
  );
  assert.equal(rest.length, 0);
  assert.ok(commit);
  assert.doesNotMatch(`${commit.subject}${commit.author}`, /[\p{Cc}\p{Cf}]/u);
  assert.match(commit.subject, /red/u);
  assert.equal(parseCommits('').length, 0);
  const long = parseCommits(record('abcd123', '', ['a', 1], 'x'.repeat(1_000_000)))[0];
  assert.ok(long && long.subject.length <= 500);
  assert.ok(
    Number.isNaN(
      parseCommits(record('abcd123', '', ['a', 1], 's').replace('\x1f1\x1f', '\x1fsoon\x1f'))[0]
        ?.when ?? 0,
    ),
  );
});

await test('counts are "behind<TAB>ahead"; anything else is unknown', () => {
  assert.deepEqual(parseCounts('2\t5\n'), { behind: 2, ahead: 5 });
  assert.equal(parseCounts(''), undefined);
  assert.equal(parseCounts('fatal: nope'), undefined);
});

await test('relative time reads naturally and never throws', () => {
  const now = 10_000_000 * 1000;
  const ago = (seconds: number) => relativeTime(now, 10_000_000 - seconds);
  assert.equal(ago(5), 'just now');
  assert.equal(ago(60), '1 minute ago');
  assert.equal(ago(7200), '2 hours ago');
  assert.equal(ago(86_400 * 3), '3 days ago');
  assert.equal(ago(86_400 * 14), '2 weeks ago');
  assert.equal(ago(86_400 * 400), '1 year ago');
  assert.equal(ago(-500), 'just now', 'a commit dated in the future');
  assert.equal(relativeTime(now, Number.NaN), 'unknown date');
});

const colours: string[] = [];
const theme = {
  fg: (colour: string, text: string) => {
    colours.push(`${colour}:${text}`);
    return text;
  },
  bold: (text: string) => text,
} as unknown as Pick<Theme, 'fg' | 'bold'>;
const commit = (hash: string, subject: string, extra: Partial<CommitInfo> = {}): CommitInfo => ({
  hash,
  parents: 1,
  author: 'Ann',
  when: 1000,
  subject,
  ...extra,
});
const now = 1000 * 1000 + 86_400_000 * 2;
const base: AheadReport = { branch: 'main', ahead: [], behind: [], recent: [], shallow: false };
const draw = (report: AheadReport, width = 80) => aheadLines(report, { theme, width, now });

await test('ahead list: stat colours, merge and no-stat labels, the 100 cap line', () => {
  colours.length = 0;
  const lines = draw({
    ...base,
    head: commit('aaa1111', 'Newest'),
    upstream: { name: 'origin/main', tip: commit('bbb2222', 'Pushed') },
    counts: { ahead: 103, behind: 0 },
    ahead: [
      commit('aaa1111', 'Newest', { stat: { files: 3, added: 42, deleted: 7 } }),
      commit('ccc3333', 'Merge x', { parents: 2 }),
      commit('ddd4444', 'logo'),
    ],
  });
  const text = lines.join('\n');
  assert.match(text, /Commits ahead of origin\/main \(103\)/u);
  assert.match(text, /3 files \+42 −7/u);
  assert.match(text, /merge/u);
  assert.match(text, /no text changes/u);
  assert.match(text, /… 100 more/u);
  assert.match(text, /ahead 103 · behind 0/u);
  assert.match(text, /As of the last fetch \(no network\)/u);
  assert.ok(colours.includes('success:+42') && colours.includes('error:−7'));
  assert.ok(colours.includes('success:ahead 103'));
});

await test('behind is warning coloured and listed; nothing ahead says so', () => {
  colours.length = 0;
  const text = draw({
    ...base,
    head: commit('aaa1111', 'Mine'),
    upstream: { name: 'origin/main', tip: commit('bbb2222', 'Theirs') },
    counts: { ahead: 0, behind: 1 },
    behind: [commit('bbb2222', 'Theirs')],
  }).join('\n');
  assert.match(text, /Nothing to push\./u);
  assert.match(text, /Behind origin\/main \(1\)/u);
  assert.ok(colours.includes('warning:behind 1'));
});

await test('unknown ahead is said plainly: no upstream, detached, gone, no commits', () => {
  const local = commit('aaa1111', 'Local one');
  const recent = [local];
  const none = draw({ ...base, head: local, recent }).join('\n');
  assert.match(none, /no upstream configured/u);
  assert.match(none, /ahead unknown \(not zero\)/u);
  assert.match(none, /Ahead is unknown, not zero\./u);
  assert.match(none, /Recent local commits \(context, not a count\)/u);
  assert.doesNotMatch(none, /Nothing to push/u);
  const detached = draw({ ...base, branch: null, head: local, recent }).join('\n');
  assert.match(detached, /detached HEAD at aaa1111/u);
  const gone = draw({
    ...base,
    head: local,
    recent,
    upstream: { name: 'origin/x' },
  }).join('\n');
  assert.match(gone, /origin\/x \[gone\]/u);
  assert.match(gone, /is gone/u);
  const empty = draw(base).join('\n');
  assert.match(empty, /No commits yet\./u);
  const shallow = draw({ ...base, shallow: true }).join('\n');
  assert.match(shallow, /Shallow clone/u);
});

await test('no line is wider than the width, down to a few columns', () => {
  const report: AheadReport = {
    ...base,
    head: commit('aaa1111', '界'.repeat(200)),
    upstream: { name: 'origin/main', tip: commit('bbb2222', 'y'.repeat(300)) },
    counts: { ahead: 1, behind: 1 },
    ahead: [
      commit('aaa1111', '界'.repeat(200), {
        author: 'A'.repeat(200),
        stat: { files: 1, added: 1, deleted: 1 },
      }),
    ],
    behind: [commit('bbb2222', 'z'.repeat(300))],
  };
  for (const width of [80, 30, 12, 4])
    for (const line of draw(report, width))
      assert.ok(visibleWidth(line) <= width, `${width}: ${line}`);
});
