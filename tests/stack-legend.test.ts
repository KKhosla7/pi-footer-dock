import assert from 'node:assert/strict';
import { test } from 'node:test';
import { facts, gap, stack } from '../src/core/explain/blocks.js';
import { renderBlocks } from '../src/core/explain/render.js';
import { plainStyle } from '../src/ui/explain-style.js';
import { visibleWidth } from '@earendil-works/pi-tui';

/**
 * A blank row between a stacked bar and its legend, and
 * a legend that breaks between entries, never inside one.
 */
const ENTRIES = [
  '█ uncached input $1.13 36%',
  '▓ cache read $0.94 30%',
  '▒ cache write $0.31 10%',
  '░ output $0.76 24%',
];
const block = stack(
  { label: 'uncached input', amount: 1.13, tone: 'accent', text: '$1.13' },
  { label: 'cache read', amount: 0.94, tone: 'success', text: '$0.94' },
  { label: 'cache write', amount: 0.31, tone: 'muted', text: '$0.31' },
  { label: 'output', amount: 0.76, tone: 'warning', text: '$0.76' },
);
const render = (width: number): string[] => renderBlocks([block], plainStyle, width);
const WIDTHS = Array.from({ length: 151 }, (_, index) => index + 10);
const LONGEST = Math.max(...ENTRIES.map((entry) => entry.length));

await test('the bar is followed by exactly one blank row, then the legend', () => {
  for (const width of WIDTHS) {
    const lines = render(width);
    assert.match(lines[0] ?? '', /^ [█▓▒░]+$/u, `${width}: the bar`);
    assert.equal(lines[1], '', `${width}: one blank row`);
    assert.notEqual(lines[2], '', `${width}: the legend follows at once after it`);
  }
});

await test('every legend entry is whole on one row whenever it can fit', () => {
  for (const width of WIDTHS.filter((candidate) => candidate >= LONGEST + 1)) {
    const rows = render(width).slice(2);
    for (const entry of ENTRIES)
      assert.equal(
        rows.filter((row) => row.includes(entry)).length,
        1,
        `${width}: "${entry}" is split or missing in\n${rows.join('\n')}`,
      );
  }
});

await test('the legend keeps its order, and no row starts or ends with a gap', () => {
  for (const width of WIDTHS) {
    const rows = render(width).slice(2);
    for (const row of rows) {
      assert.ok(visibleWidth(row) <= width, `${width}: a row is too wide: "${row}"`);
      assert.match(row, /^ \S/u, `${width}: a row starts with a gap: "${row}"`);
      assert.equal(row, row.trimEnd(), `${width}: a row ends with a gap`);
    }
    // Wrapped inside an entry only below the longest entry; the words must still be in order.
    const words = rows.join(' ').split(/\s+/u).filter(Boolean);
    assert.deepEqual(words, ENTRIES.join(' ').split(' '), `${width}: order or content changed`);
  }
});

await test('a wide terminal keeps the whole legend on one row; a narrow one fills rows with whole entries', () => {
  assert.equal(render(120).slice(2).length, 1);
  assert.deepEqual(render(64).slice(2), [
    ' █ uncached input $1.13 36%   ▓ cache read $0.94 30%',
    ' ▒ cache write $0.31 10%   ░ output $0.76 24%',
  ]);
});

await test('the legend has a blank row after it whatever follows, and never two', () => {
  const prompt = facts({ label: 'Prompt', value: '31.4k tokens', note: 'uncached + read' });
  const legend = render(100).length; // the bar, a blank row, the legend
  const direct = renderBlocks([block, prompt], plainStyle, 100);
  assert.equal(direct[legend], '', 'a blank row between the legend and the facts after it');
  assert.match(direct[legend + 1] ?? '', /Prompt/u);
  const gapped = renderBlocks([block, gap, prompt], plainStyle, 100);
  assert.equal(gapped[legend], '', 'one blank row');
  assert.match(gapped[legend + 1] ?? '', /Prompt/u, 'an explicit gap does not double it');
  assert.notEqual(render(100).at(-1), '', 'nothing follows: no trailing blank row');
});
