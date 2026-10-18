import assert from 'node:assert/strict';
import { test } from 'node:test';
import { visibleWidth } from '@earendil-works/pi-tui';
import { mergeChangedFiles, parseNumstat, parseStatusEntries } from '../src/core/changed-files.js';
import type { ChangedFile, FileSize } from '../src/core/changed-files.js';
import { changedFilesLines, fitPath } from '../src/ui/changed-files-view.js';

const used: string[] = [];
const theme = {
  fg: (colour: string, text: string) => {
    used.push(`${colour}:${text}`);
    return text;
  },
  bold: (text: string) => text,
};
const file = (path: string, over: Partial<ChangedFile> = {}): ChangedFile => ({
  path,
  status: 'M',
  size: { kind: 'lines', lines: 1234 },
  added: 12,
  removed: 3,
  ...over,
});

await test('status records: every kind the footer counts, rename source skipped, odd names intact', () => {
  const data =
    '# branch.head main\0' +
    '1 .M N... 100644 100644 100644 aaa bbb dir/with space.txt\0' +
    '2 R. N... 100644 100644 100644 aaa bbb R100 new name.txt\0old name.txt\0' +
    'u UU N... 100644 100644 100644 100644 a b c conflict.txt\0' +
    '1 .M S.M. 160000 160000 160000 aaa bbb sub\0' +
    '? new\nline.txt\0';
  assert.deepEqual(
    parseStatusEntries(data).map((entry) => [entry.path, entry.status, entry.submodule]),
    [
      ['dir/with space.txt', 'M', false],
      ['new name.txt', 'R', false],
      ['conflict.txt', 'U', false],
      ['sub', 'M', true],
      ['new\nline.txt', '?', false],
    ],
  );
  const kinds = (xy: string) => parseStatusEntries(`1 ${xy} N... 1 1 1 a b p\0`)[0]?.status;
  assert.deepEqual(['A.', '.A', 'AM', 'D.', '.D', 'MD', 'M.', '.T'].map(kinds), [
    'A',
    'A',
    'A',
    'D',
    'D',
    'D',
    'M',
    'M',
  ]);
});

await test('numstat: binary dashes, renames keyed by the new path, odd names', () => {
  const stats = parseNumstat(
    '1\t2\ta.txt\0-\t-\tbin\0 0\t0\t\0'.replace(' ', '') + 'old\0new\0' + '3\t0\tna\tme\nx\0',
  );
  assert.deepEqual([...stats.keys()], ['a.txt', 'bin', 'new', 'na\tme\nx']);
  assert.deepEqual(stats.get('bin'), { added: null, removed: null });
  assert.deepEqual(stats.get('new'), { added: 0, removed: 0 });
  assert.deepEqual(stats.get('na\tme\nx'), { added: 3, removed: 0 });
});

await test('merging: tracked counts from numstat, untracked from lines, sorted by path', () => {
  const entries = parseStatusEntries(
    '? z\0? a\0.\0'.replace('.\0', '') + '1 .M N... 1 1 1 a b m\0',
  );
  const sizes = new Map<string, FileSize>([
    ['z', { kind: 'lines', lines: 4 }],
    ['a', { kind: 'binary' }],
    ['m', { kind: 'lines', lines: 9 }],
  ]);
  const merged = mergeChangedFiles(entries, new Map([['m', { added: 1, removed: 2 }]]), sizes);
  assert.deepEqual(
    merged.map((f) => [f.path, f.added, f.removed]),
    [
      ['a', null, null],
      ['m', 1, 2],
      ['z', 4, 0],
    ],
  );
});

await test('fitPath cuts the middle, keeps the file name, and respects width', () => {
  assert.equal(fitPath('src/a.ts', 20), 'src/a.ts');
  assert.equal(fitPath('src/very/long/directory/name.ts', 16), 'src/very…name.ts');
  for (const path of [
    '日本語/ディレクトリ/ファイル名.ts',
    'src/' + 'x'.repeat(60) + '.ts',
    '🙂'.repeat(30),
  ])
    for (let max = 4; max < 40; max += 1) {
      const fitted = fitPath(path, max);
      assert.ok(visibleWidth(fitted) <= max, `${fitted} > ${max}`);
    }
  assert.match(fitPath('src/' + 'd/'.repeat(30) + 'keep-me.ts', 24), /…keep-me\.ts$/u);
});

await test('rows are aligned, coloured, and never wider than the screen', () => {
  used.length = 0;
  const files = [
    file('src/a.ts'),
    file('日本語/ディレクトリ/ファイル名.ts', { status: 'A', added: 5, removed: 0 }),
    file('x'.repeat(200) + '/y.txt', {
      status: '?',
      size: { kind: 'large' },
      added: null,
      removed: null,
    }),
    file('gone.txt', { status: 'D', size: { kind: 'deleted' }, added: 0, removed: 7 }),
    file('one', { size: { kind: 'lines', lines: 1 }, added: 0, removed: 0 }),
  ];
  for (const width of [40, 50, 80, 120]) {
    const lines = changedFilesLines({ kind: 'files', files }, theme, width);
    for (const line of lines.slice(2)) assert.ok(visibleWidth(line) <= width, `${width}: ${line}`);
  }
  const lines = changedFilesLines({ kind: 'files', files }, theme, 70);
  assert.equal(lines[0], ' 5 files · +17 −10 ■■■■■');
  const ends = lines.slice(2, -2).map((line) => visibleWidth(line));
  assert.equal(new Set(ends).size, 1, 'the columns line up, one width for every row');
  assert.match(
    lines.at(-1) ?? '',
    /M modified.*A new.*D deleted/u,
    'a legend for the letters shown',
  );
  assert.ok(used.includes('success:+12') && used.includes('error:−3'));
  assert.ok(used.includes('success:+17') && used.includes('error:−10'));
  assert.ok(lines.some((line) => line.includes('1,234 lines')));
  assert.ok(lines.some((line) => /one +1 line +±0 ■{5}$/u.test(line)));
});

await test('messages for the states without files', () => {
  const text = (kind: 'not-repository' | 'git-missing' | 'failed') =>
    changedFilesLines({ kind }, theme, 40).join('');
  assert.match(text('not-repository'), /Not inside a Git work tree/u);
  assert.match(text('git-missing'), /Git could not be started/u);
  assert.match(text('failed'), /could not be read/u);
});

await test('totals say when untracked files were not read', () => {
  const skipped = file('u', { status: '?', size: { kind: 'skipped' }, added: null });
  const lines = changedFilesLines({ kind: 'files', files: [skipped] }, theme, 60);
  assert.match(lines[0] ?? '', /some untracked files not counted/u);
});
