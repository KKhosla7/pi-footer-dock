import assert from 'node:assert/strict';
import { test } from 'node:test';
import { visibleWidth } from '@earendil-works/pi-tui';
import {
  bullets,
  facts,
  gap,
  heading,
  meters,
  note,
  stack,
  table,
} from '../src/core/explain/blocks.js';
import type { Block } from '../src/core/explain/blocks.js';
import { compose } from '../src/core/explain/explainer.js';
import { renderBlocks } from '../src/core/explain/render.js';
import { shares } from '../src/core/explain/render-bars.js';
import { explainerFor, explainers } from '../src/core/explain/registry.js';
import { plainStyle } from '../src/ui/explain-style.js';
import { demoSnapshot } from './reference.js';

const hostile = 'evil\u001b[31m model\nname ‮ 日本語日本語日本語日本語';
const never = (): never => {
  throw new Error('no explainer registered');
};
const meterBlock = meters(
  { label: 'Used', fraction: 0.42, text: '42% used', tone: 'warning', mark: 0.3 },
  { label: 'Unknown', fraction: null, text: 'no data' },
);
const stackBlock = stack(
  { label: 'read', amount: 70, tone: 'success', text: '2.1M' },
  { label: 'uncached', amount: 25, tone: 'warning' },
  { label: 'written', amount: 5, tone: 'accent' },
);
const sample: Block[] = [
  heading('A heading'),
  facts({
    label: 'Path',
    value: hostile,
    note: 'a note that is quite long indeed so it may wrap around',
  }),
  meterBlock,
  stackBlock,
  table(
    ['Model', 'Tokens', 'Dollars'],
    [
      [hostile, '1,200,000', '$1.20'],
      ['b', '3', '$0.00'],
    ],
    [1, 2],
  ),
  bullets({ term: 'Term', text: hostile }, { text: 'plain bullet '.repeat(12), tone: 'error' }),
  note('A paragraph. '.repeat(30)),
  gap,
];

await test('no block ever draws wider than the width, at any width or glyph set', () => {
  for (const ascii of [false, true])
    for (let width = 10; width <= 200; width += 1)
      for (const line of renderBlocks(sample, plainStyle, width, ascii))
        assert.ok(
          visibleWidth(line) <= Math.max(10, width),
          `width ${width}: ${JSON.stringify(line)}`,
        );
});

await test('text from outside the extension cannot inject terminal sequences or control characters', () => {
  const text = renderBlocks(sample, plainStyle, 80).join('\n');
  const bad = Array.from(text, (char) => char.charCodeAt(0)).filter(
    (code) => (code < 32 && code !== 10) || code === 0x202e,
  );
  assert.deepEqual(bad, []);
});

await test('a meter shows the fill, the pace mark and the text; an unknown meter is an empty bar', () => {
  const [used, blank, unknown] = renderBlocks([meterBlock], plainStyle, 60);
  assert.ok(used !== undefined && unknown !== undefined);
  assert.equal(blank, '', 'a blank row keeps the meters apart');
  assert.match(used, /█+.*┃.*░+\s+42% used/u);
  assert.match(unknown, /^ Unknown\s+░+\s+no data$/u);
  const portable = renderBlocks([meterBlock], plainStyle, 60, true).join('\n');
  assert.doesNotMatch(portable, /[█░┃]/u);
  assert.match(portable, /#+.*\|.*-+/u);
});

await test('a narrow width drops the bar but keeps the number', () => {
  const [line] = renderBlocks(
    [meters({ label: 'Used', fraction: 0.5, text: '50% used' })],
    plainStyle,
    18,
  );
  assert.ok(line);
  assert.equal(line.includes('█'), false);
  assert.match(line, /50% used/u);
});

await test('stack cells add up to the bar and every non-zero part is in the legend', () => {
  for (let total = 1; total <= 80; total += 7)
    assert.equal(
      shares([70, 25, 5, 0], total).reduce((a, b) => a + b, 0),
      total,
    );
  assert.deepEqual(shares([0, 0], 10), [0, 0]);
  const lines = renderBlocks([stackBlock], plainStyle, 80);
  assert.match(lines.join('\n'), /read 2\.1M 70%.*uncached 25%.*written 5%/u);
  assert.equal(
    renderBlocks([stack({ label: 'x', amount: 0, tone: 'dim' })], plainStyle, 40).length,
    0,
  );
});

await test('every explainer states what it reports and when it is missing, and frames itself', () => {
  assert.ok(explainers.length >= 11);
  const ids = new Set<string>();
  for (const explainer of explainers) {
    assert.ok(!ids.has(explainer.id), `${explainer.id} is registered twice`);
    ids.add(explainer.id);
    assert.ok(explainer.reports.length > 0 && explainer.missingWhen.length > 0, explainer.id);
    const doc = compose(explainer, { snapshot: demoSnapshot, now: 0, value: 'x', ascii: false });
    const text = renderBlocks([...doc.headline, ...doc.body], plainStyle, 70).join('\n');
    assert.match(text, /Now: /u, explainer.id);
    assert.match(text, /What it reports/u, explainer.id);
    assert.match(text, /Can be missing when/u, explainer.id);
    assert.doesNotMatch(text, /NaN|undefined|\[object/u, explainer.id);
  }
});

await test('the status line has air above and below, so value, status and detail read apart', () => {
  const doc = compose(explainerFor('branch') ?? explainers[0] ?? never(), {
    snapshot: demoSnapshot,
    now: 0,
    value: 'x',
    ascii: false,
  });
  const lines = renderBlocks([...doc.headline, ...doc.body], plainStyle, 70);
  const at = lines.findIndex((line) => line.startsWith(' Now: '));
  assert.ok(at > 0);
  assert.equal(lines[at - 1], '');
  assert.equal(lines[at + 1], '');
  assert.notEqual(lines[at + 2], '', 'one blank row, not two');
});

await test('a table or chart followed straight by prose gets one blank row between them', () => {
  const lines = renderBlocks(
    [
      table(['A', 'B'], [['1', '2']]),
      bullets({ text: 'after' }),
      table(['A'], [['1']]),
      heading('Next'),
    ],
    plainStyle,
    60,
  );
  const bullet = lines.findIndex((line) => line.includes('after'));
  assert.equal(lines[bullet - 1], '');
  assert.notEqual(lines[bullet - 2], '');
  const next = lines.findIndex((line) => line.includes('Next'));
  assert.notEqual(lines[next - 1], '', 'a heading is not padded: the caller already did that');
});
