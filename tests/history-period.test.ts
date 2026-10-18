process.env.TZ = 'America/New_York';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { periodStart, periodStartBack, series } from '../src/core/history/period.js';
import { cacheShare, groupBy, inPeriod, sum } from '../src/core/history/queries.js';
import type { HistoryRow } from '../src/core/history/rows.js';

await test('periods start today, on Monday and on the 1st, across a month end and a clock change', () => {
  const wednesday = new Date(2026, 9, 14, 15, 0);
  assert.equal(periodStart('day', wednesday), '2026-10-14');
  assert.equal(periodStart('week', wednesday), '2026-10-12');
  assert.equal(periodStart('month', wednesday), '2026-10-01');
  const sunday = new Date(2026, 9, 18, 9, 0);
  assert.equal(
    periodStart('week', sunday),
    '2026-10-12',
    'Sunday belongs to the week that began on Monday',
  );
  assert.equal(periodStartBack('week', wednesday, 1), '2026-10-05');
  assert.equal(periodStartBack('month', new Date(2026, 0, 15), 1), '2025-12-01');
  assert.equal(periodStartBack('day', new Date(2026, 10, 2, 12), 1), '2026-11-01');
  assert.equal(
    periodStartBack('week', new Date(2026, 10, 3, 12), 1),
    '2026-10-26',
    'across the clock change on 1 Nov 2026',
  );
});

await test('a series has one bin per period, oldest first, and adds each row to the bin it falls in', () => {
  const row = (day: string, cost: number): HistoryRow => ({
    day,
    project: 'a',
    provider: 'p',
    model: 'm',
    api: 'x',
    gap: '1m',
    responses: 1,
    input: 1,
    output: 1,
    read: 0,
    write: 0,
    cost,
    unpriced: 0,
  });
  const rows = [
    row('2026-10-14', 1),
    row('2026-10-13', 2),
    row('2026-10-12', 4),
    row('2026-10-01', 8),
    row('2026-09-30', 16),
    row('2026-10-15', 99),
  ];
  const today = new Date(2026, 9, 14, 12);
  assert.deepEqual(
    series(rows, 'day', today, 3).map((bin) => [bin.start, bin.cost]),
    [
      ['2026-10-12', 4],
      ['2026-10-13', 2],
      ['2026-10-14', 1],
    ],
  );
  assert.deepEqual(
    series(rows, 'week', today, 2).map((bin) => [bin.start, bin.cost]),
    [
      ['2026-10-05', 0],
      ['2026-10-12', 7],
    ],
  );
  assert.deepEqual(
    series(rows, 'month', today, 2).map((bin) => [bin.start, bin.cost]),
    [
      ['2026-09-01', 16],
      ['2026-10-01', 15],
    ],
  );
});

await test('totals, groups and the weighted cache share come from the rows', () => {
  const a: HistoryRow = {
    day: '2026-10-14',
    project: 'a',
    provider: 'p',
    model: 'm',
    api: 'x',
    gap: '1m',
    responses: 1,
    input: 100,
    output: 1,
    read: 900,
    write: 0,
    cost: 1,
    unpriced: 0,
  };
  const b: HistoryRow = { ...a, project: 'b', input: 9_000, read: 1_000, cost: 2 };
  const today = new Date(2026, 9, 14, 12);
  assert.equal(sum(inPeriod([a, b], 'day', today)).cost, 3);
  assert.equal(inPeriod([{ ...a, day: '2026-10-13' }], 'day', today).length, 0);
  const byProject = groupBy([a, b], 'project');
  assert.equal(byProject.get('a')?.read, 900);
  assert.equal(byProject.get('b')?.input, 9_000);
  assert.equal(groupBy([a], 'model').has('p/m'), true);
  // 1,900 read of 11,000 prompt tokens: not the mean of 90% and 10%.
  assert.equal(Math.round(cacheShare(sum([a, b])) ?? -1), 17);
  assert.equal(cacheShare(sum([{ ...a, read: 0 }])), null, 'no reads reported is not 0%');
});
