process.env.TZ = 'America/New_York';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { bars } from '../src/core/explain/blocks.js';
import { cache } from '../src/core/explain/items/cache.js';
import { cost } from '../src/core/explain/items/cost.js';
import { compose } from '../src/core/explain/explainer.js';
import type { Explainer } from '../src/core/explain/explainer.js';
import { renderBlocks } from '../src/core/explain/render.js';
import type { Period } from '../src/core/history/period.js';
import type { GapBucket, HistoryRow } from '../src/core/history/rows.js';
import { plainStyle } from '../src/ui/explain-style.js';
import { visibleWidth } from '@earendil-works/pi-tui';
import { demoSnapshot } from './reference.js';

const NOW = new Date(2026, 9, 14, 12).getTime();
interface Amounts {
  input: number;
  read: number;
  dollars: number;
  model?: string;
}
const row = (day: string, project: string, gap: GapBucket, amounts: Amounts): HistoryRow => ({
  day,
  project,
  provider: 'p',
  model: amounts.model ?? 'm',
  api: 'x',
  gap,
  responses: 2,
  input: amounts.input,
  output: 5,
  read: amounts.read,
  write: 0,
  cost: amounts.dollars,
  unpriced: 0,
});
const rows = [
  row('2026-10-14', 'a', '1m', { input: 100, read: 900, dollars: 2 }),
  row('2026-10-14', 'b', 'long', { input: 900, read: 100, dollars: 1, model: 'n' }),
  row('2026-10-12', 'a', '1m', { input: 100, read: 900, dollars: 4 }),
  row('2026-10-01', 'a', 'first', { input: 1_000, read: 0, dollars: 8 }),
  row('2026-09-20', 'a', '5m', { input: 100, read: 900, dollars: 16 }),
];
const history = { rows, projects: { a: 'alpha', b: 'beta\u001b[31m' } };
const show = (explainer: Explainer, period: Period, width = 100, ascii = false): string => {
  const doc = compose(explainer, {
    snapshot: { ...demoSnapshot, history },
    now: NOW,
    value: '',
    ascii,
    period,
  });
  return renderBlocks([...doc.headline, ...doc.body], plainStyle, width, ascii).join('\n');
};

await test('a chart is three rows of columns with the peak named and the ends of the axis labelled', () => {
  const lines = renderBlocks(
    [bars({ values: [0, 1, 2, 4], axis: ['a', 'b'], peak: '$4', current: 3 })],
    plainStyle,
    60,
  );
  assert.equal(lines.length, 4);
  assert.match(lines[0] ?? '', /^\s+█\s+peak \$4$/u, 'only the peak reaches the top row');
  assert.match(lines[1] ?? '', /^\s+▄ █/u);
  assert.match(lines[2] ?? '', /^\s+▆ █ █/u, 'the bottom row shows every column');
  assert.match(lines[3] ?? '', /a\s+b$/u);
});

await test('a chart fits any width, has a portable form, and survives empty and all-zero data', () => {
  for (let width = 10; width <= 80; width += 7) {
    const many = renderBlocks(
      [
        bars({
          values: Array.from({ length: 30 }, (_, index) => index),
          axis: ['x', 'y'],
          peak: '$1',
        }),
      ],
      plainStyle,
      width,
    );
    for (const line of many) assert.ok(visibleWidth(line) <= Math.max(10, width), `width ${width}`);
  }
  const portable = renderBlocks(
    [bars({ values: [1, 5, 9], axis: ['a', 'b'], peak: '$9' })],
    plainStyle,
    60,
    true,
  ).join('\n');
  assert.doesNotMatch(portable, /[▁▂▃▄▅▆▇█]/u);
  assert.match(portable, /[#:.]/u);
  assert.deepEqual(
    renderBlocks([bars({ values: [], axis: ['a', 'b'], peak: '$0' })], plainStyle, 60),
    [],
  );
  assert.equal(
    renderBlocks([bars({ values: [0, 0], axis: ['a', 'b'], peak: '$0' })], plainStyle, 60).length,
    4,
  );
});

await test('cost over time: the period total leads, the chart and the tables follow the chosen period', () => {
  const month = show(cost, 'month');
  assert.match(month, /This month\s+\$15\.00\s+8 responses, all sessions/u);
  assert.match(month, /Period\s+this month\s+press d, w or m/u);
  assert.match(month, /By project, this month[\s\S]*alpha\s+6\s+\$14\.00\s+93%/u);
  assert.match(month, /beta\s+2\s+\$1\.00\s+7%/u, 'a hostile project name is drawn as plain text');
  assert.equal(month.includes('\u001b'), false);
  assert.match(month, /By model, this month[\s\S]*p\/m\s+6\s+\$14\.00/u);
  assert.match(month, /Last 12 months/u);
  const week = show(cost, 'week');
  assert.match(week, /This week\s+\$7\.00/u);
  assert.match(week, /Last 12 weeks/u);
  const day = show(cost, 'day');
  assert.match(day, /Today\s+\$3\.00/u);
  assert.match(day, /peak \$8\.00/u, 'the 14 day chart still reaches back to the 1st');
  assert.doesNotMatch(day.split('By project')[1] ?? '', /\$8\.00/u, 'but the 1st is not today');
});

await test('cache over time: reuse by idle time, project and model is weighted over all prompt tokens', () => {
  const month = show(cache, 'month');
  assert.match(month, /Reuse\s+48%\s+1\.9k read of 4k prompt tokens/u);
  assert.match(month, /up to 1 minute\s+4\s+2k\s+90%/u);
  assert.match(month, /over 1 hour\s+2\s+1k\s+10%/u);
  assert.match(month, /first of a session\s+2\s+1k\s+not reported/u, 'no reads reported is not 0%');
  assert.match(month, /alpha\s+6\s+3k\s+60%/u);
  assert.match(month, /Most low readings are a pause/u);
  assert.match(show(cache, 'day'), /By idle time[\s\S]*over 1 hour/u);
});

await test('without a history the screens say nothing about it, and many projects fold into one other row', () => {
  const plain = compose(cost, { snapshot: demoSnapshot, now: NOW, value: '', ascii: false });
  assert.doesNotMatch(
    renderBlocks([...plain.headline, ...plain.body], plainStyle, 100).join('\n'),
    /Over time|This month/u,
  );
  const crowd = Array.from({ length: 12 }, (_, index) =>
    row('2026-10-14', `p${index}`, '1m', { input: 1, read: 1, dollars: index + 1 }),
  );
  const projects = Object.fromEntries(
    crowd.map((entry) => [entry.project, entry.project.toUpperCase()]),
  );
  const doc = compose(cost, {
    snapshot: { ...demoSnapshot, history: { rows: crowd, projects } },
    now: NOW,
    value: '',
    ascii: false,
    period: 'day',
  });
  const text = renderBlocks(doc.body, plainStyle, 100).join('\n');
  assert.match(text, /other \(4\)/u);
  assert.equal(text.split('\n').filter((line) => /^ P\d+\s/u.test(line)).length, 8);
});

await test('with history but nothing in this session yet, the status says so instead of "no recorded usage"', () => {
  const text = show(cost, 'month');
  assert.match(text, /Now: nothing in this session yet; the history below is shown/u);
  assert.doesNotMatch(text, /Priced from/u, 'no session response, no price sources to list');
});
