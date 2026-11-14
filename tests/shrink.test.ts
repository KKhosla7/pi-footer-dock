import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_PLAN, planWithExtensions, shrinkRow } from '../src/core/shrink.js';
import type { RowModel, RowState } from '../src/core/shrink.js';

const WIDTHS: Record<string, number[]> = {
  workspace: [30, 20, 10],
  branch: [12],
  cost: [8],
  cache: [20, 12],
  speed: [14],
  quota: [40, 32, 24, 16, 8],
};
const IDS = Object.keys(WIDTHS);
const used = (state: RowState): number =>
  IDS.filter((id) => !state.dropped.has(id)).reduce(
    (sum, id) => sum + (WIDTHS[id]?.[state.level.get(id) ?? 0] ?? 0),
    0,
  );
const rowFor = (limit: number): RowModel => ({
  ids: IDS,
  depth: (id) => (WIDTHS[id]?.length ?? 1) - 1,
  fits: (state) => used(state) <= limit,
});

await test('a row that already fits is untouched', () => {
  const result = shrinkRow(rowFor(1000), DEFAULT_PLAN);
  assert.deepEqual(result.steps, []);
  assert.equal(result.dropped.size, 0);
});

await test('steps are taken in plan order and the walk stops at the first step after which the row fits', () => {
  const total = used({ level: new Map(), dropped: new Set() });
  const result = shrinkRow(rowFor(total - 1), ['drop:cost', 'drop:speed', 'drop:branch']);
  assert.deepEqual(result.steps, ['drop:cost']);
  const more = shrinkRow(rowFor(total - 20), ['drop:cost', 'drop:speed', 'drop:branch']);
  assert.deepEqual(more.steps, ['drop:cost', 'drop:speed']);
});

await test('a step for an item the row does not hold, or with nothing left to do, is skipped', () => {
  const result = shrinkRow(rowFor(0), [
    'drop:nobody',
    'shorten:nobody',
    'shorten:cost',
    'drop:cost',
    'drop:cost',
    'shorten:branch',
  ]);
  assert.deepEqual(result.steps, ['drop:cost']);
});

await test('shorten moves one wording per step and stops at the last one', () => {
  const result = shrinkRow(rowFor(0), ['shorten:quota', 'shorten:quota', 'shorten:quota']);
  assert.equal(result.level.get('quota'), 3);
  const all = shrinkRow(rowFor(0), Array<string>(9).fill('shorten:quota'));
  assert.equal(all.level.get('quota'), 4, 'never beyond its last wording');
  assert.equal(all.steps.length, 4);
});

await test('monotone: a wider row takes a prefix of the steps a narrower one takes', () => {
  let previous: string[] | undefined;
  for (let limit = 200; limit >= 0; limit -= 1) {
    const steps = shrinkRow(rowFor(limit), DEFAULT_PLAN).steps;
    if (previous) assert.deepEqual(steps.slice(0, previous.length), previous, `at ${limit}`);
    previous = steps;
  }
});

await test('the solver is deterministic', () => {
  assert.deepEqual(shrinkRow(rowFor(60), DEFAULT_PLAN), shrinkRow(rowFor(60), DEFAULT_PLAN));
});

await test('items of other extensions give way after the least important built-in items, the last registered first', () => {
  const depth = (id: string) => (id === 'a' ? 2 : 0);
  const plan = planWithExtensions(['a', 'b'], depth);
  const at = (step: string) => plan.indexOf(step);
  assert.ok(at('drop:output') < at('drop:b'), 'after the least important built-in items');
  assert.deepEqual(plan.slice(at('drop:b'), at('drop:a') + 1), [
    'drop:b',
    'shorten:a',
    'shorten:a',
    'drop:a',
  ]);
  assert.equal(plan[0], 'shorten:quota', 'the quota drops its wording before anything else');
  assert.ok(at('drop:a') < plan.lastIndexOf('shorten:quota'), 'before the quota loses its meter');
  assert.deepEqual(planWithExtensions([], depth), DEFAULT_PLAN);
});

await test('the default plan is bounded, names only closed steps, never drops the project name and drops nothing twice', () => {
  assert.ok(DEFAULT_PLAN.length <= 64);
  assert.ok(DEFAULT_PLAN.every((step) => /^(shorten|drop):[a-z-]+$/u.test(step)));
  assert.ok(!DEFAULT_PLAN.includes('drop:workspace'));
  const drops = DEFAULT_PLAN.filter((step) => step.startsWith('drop:'));
  assert.equal(new Set(drops).size, drops.length);
});
