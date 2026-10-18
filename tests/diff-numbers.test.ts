import assert from 'node:assert/strict';
import { test } from 'node:test';
import { changeRanges, formatRanges, numberLines } from '../src/core/diff-numbers.js';

const diff = [
  'diff --git a/x.ts b/x.ts',
  'index 1..2 100644',
  '--- a/x.ts',
  '+++ b/x.ts',
  '@@ -10,6 +10,8 @@ function f() {',
  ' keep a',
  '-old b',
  '+new b',
  '+new c',
  ' keep d',
  ' keep e',
  '@@ -40,4 +42,3 @@',
  ' ctx',
  '-gone 1',
  '-gone 2',
  ' after',
  '@@ -80,2 +81,3 @@',
  ' z',
  '+tail',
  '\\ No newline at end of file',
];

await test('every line of a diff gets the numbers it has in the old and the new file', () => {
  const lines = numberLines(diff);
  const at = (raw: string) => {
    const found = lines.find((line) => line.raw === raw);
    assert.ok(found, raw);
    return found;
  };
  assert.equal(at('diff --git a/x.ts b/x.ts').kind, 'header');
  assert.equal(at(' keep a').newNo, 10);
  assert.equal(at(' keep a').oldNo, 10);
  assert.deepEqual([at('-old b').oldNo, at('-old b').newNo], [11, undefined]);
  assert.deepEqual([at('+new b').newNo, at('+new c').newNo], [11, 12]);
  assert.equal(at(' keep d').newNo, 13);
  assert.equal(at(' ctx').newNo, 42, 'the second hunk starts from its own header');
  assert.equal(at(' after').newNo, 43);
  assert.equal(at('+tail').newNo, 82);
  assert.equal(at('\\ No newline at end of file').kind, 'meta');
  assert.equal(at('\\ No newline at end of file').newNo, undefined);
});

await test('the changed stretches are listed in new-file numbers; removals alone say where they were', () => {
  const ranges = changeRanges(numberLines(diff));
  assert.deepEqual(ranges, [
    { from: 11, to: 12, removedOnly: false },
    { from: 43, to: 43, removedOnly: true },
    { from: 82, to: 82, removedOnly: false },
  ]);
  assert.equal(formatRanges(ranges), '11–12, 43 (removed), 82');
});

await test('a long list is cut with a count, and no diff gives no ranges', () => {
  const many = Array.from({ length: 12 }, (_, index) => ({
    from: index * 10 + 1,
    to: index * 10 + 1,
    removedOnly: false,
  }));
  assert.equal(formatRanges(many, 3), '1, 11, 21, … 9 more');
  assert.deepEqual(changeRanges(numberLines([])), []);
  assert.deepEqual(changeRanges(numberLines(['Binary files a/x and b/x differ'])), []);
});

await test('a new file is lines 1 to n, and a deleted file is removed lines only', () => {
  const added = numberLines([
    'diff --git a/n b/n',
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/n',
    '@@ -0,0 +1,3 @@',
    '+a',
    '+b',
    '+c',
  ]);
  assert.deepEqual(changeRanges(added), [{ from: 1, to: 3, removedOnly: false }]);
  const removed = numberLines([
    'diff --git a/d b/d',
    '--- a/d',
    '+++ /dev/null',
    '@@ -1,2 +0,0 @@',
    '-a',
    '-b',
  ]);
  assert.deepEqual(
    changeRanges(removed).map((range) => range.removedOnly),
    [true],
  );
});
