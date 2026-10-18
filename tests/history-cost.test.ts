process.env.TZ = 'America/New_York';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { costDisplay, periodCostLabel, periodCostsOf } from '../src/core/history/costs.js';
import type { HistoryRow } from '../src/core/history/rows.js';
import { choose, menuRows } from '../src/core/settings-menu.js';
import { menuEntries } from '../src/core/settings-groups.js';
import { defaultSettings, parseSettings } from '../src/core/settings.js';
import { estimateApiCost } from '../src/core/api-cost.js';
import { demoSnapshot } from './reference.js';
import { solPrices } from './support/prices.js';

const row = (day: string, cost: number, unpriced = 0): HistoryRow => ({
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
  unpriced,
});
const today = new Date(2026, 9, 14, 12);

await test('the footer label shows the period, rounds like the session cost, and marks a lower bound', () => {
  assert.equal(periodCostLabel('month', { cost: 62.264, unpriced: 0, responses: 5 }), '≈$62.26 mo');
  assert.equal(periodCostLabel('week', { cost: 3.1, unpriced: 0, responses: 5 }), '≈$3.10 wk');
  assert.equal(periodCostLabel('day', { cost: 0.004, unpriced: 0, responses: 5 }), '≈<$0.01 day');
  assert.equal(periodCostLabel('month', { cost: 62.26, unpriced: 2, responses: 5 }), '≈$62.26+ mo');
  assert.equal(
    periodCostLabel('month', { cost: 0.004, unpriced: 2, responses: 5 }),
    '',
    'a lower bound under a cent says nothing',
  );
  assert.equal(
    periodCostLabel('month', { cost: 0, unpriced: 0, responses: 0 }),
    '',
    'no responses, nothing to show',
  );
});

await test('totals follow the calendar: today, this week from Monday, this month', () => {
  const rows = [
    row('2026-10-14', 1),
    row('2026-10-13', 2),
    row('2026-10-11', 4),
    row('2026-10-01', 8),
    row('2026-09-30', 16),
  ];
  const costs = periodCostsOf(rows, today);
  assert.deepEqual([costs.day.cost, costs.week.cost, costs.month.cost], [1, 3, 15]);
  const withMemory = periodCostsOf(rows, today, { cost: 0.5, unpriced: 1, responses: 2 });
  assert.deepEqual([withMemory.day.cost, withMemory.month.unpriced], [1.5, 1]);
});

await test('the footer shows the chosen period once the history is known, otherwise this session', () => {
  const session = estimateApiCost(
    [
      {
        provider: 'openai-codex',
        model: 'gpt-6.1-sol',
        usage: {
          input: 1000,
          output: 100,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 1100,
          cost: { input: 0.1, output: 0.1, cacheRead: 0, cacheWrite: 0, total: 0.2 },
        },
      },
    ],
    solPrices,
  );
  const known = {
    ...demoSnapshot,
    apiCostEstimate: session,
    historyCosts: periodCostsOf([row('2026-10-14', 7)], today),
  };
  assert.equal(costDisplay(known), '≈$7.00 mo', 'the month is the default');
  assert.equal(costDisplay(known, 'day'), '≈$7.00 day');
  assert.equal(costDisplay(known, 'session'), '≈$0.20');
  const unknown = { ...demoSnapshot, apiCostEstimate: session };
  assert.equal(
    costDisplay(unknown),
    '≈$0.20',
    'no history yet: this session, with no suffix to say otherwise',
  );
});

await test('the cost period is a saved setting, defaults to the month, and a bad value is refused', () => {
  const rows = menuRows(defaultSettings(), []);
  const period = rows.find((entry) => entry.id === 'period');
  assert.ok(period);
  assert.equal(period.current, 'month');
  assert.equal(period.default, 'month');
  const week = choose(defaultSettings(), 'period', 'week');
  assert.deepEqual(week.slots.cost, { period: 'week' });
  assert.deepEqual(parseSettings(JSON.parse(JSON.stringify(week))).slots.cost, { period: 'week' });
  assert.equal(
    choose(week, 'period', 'month').slots.cost?.period,
    undefined,
    'the default stores nothing',
  );
  assert.deepEqual(
    choose(defaultSettings(), 'period', 'year'),
    defaultSettings(),
    'an unknown value changes nothing',
  );
  assert.throws(() => parseSettings({ version: 1, slots: { cost: { period: 'year' } } }));
  assert.throws(
    () => parseSettings({ version: 1, slots: { quota: { period: 'day' } } }),
    /not available/u,
  );
});

await test('the period row sits with the other cost settings', () => {
  const usage = menuEntries(defaultSettings(), []).find((entry) => entry.id === 'group:usage');
  assert.ok(usage?.children?.some((child) => child.id === 'period'));
});
