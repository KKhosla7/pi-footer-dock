import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { stripVTControlCharacters } from 'node:util';
import { visibleWidth } from '@earendil-works/pi-tui';
import { defaultFooterConfig, parseFooterConfig } from '../src/core/footer-config.js';
import { applySettings, defaultSettings, parseSettings } from '../src/core/settings.js';
import { DEFAULT_PLAN, STEP_NAMES, orderPlan, parseShrink } from '../src/core/shrink.js';
import { portableGlyphs } from '../src/ui/glyphs.js';
import { layoutFooter } from '../src/ui/layout.js';
import { NOW, paint } from './support/layout-matrix.js';
import { withCost } from './reference.js';

const count = (plan: readonly string[]): Map<string, number> => {
  const counts = new Map<string, number>();
  for (const step of plan) counts.set(step, (counts.get(step) ?? 0) + 1);
  return counts;
};
const sameSteps = (a: readonly string[], b: readonly string[]): void => {
  assert.deepEqual([...count(a)].sort(), [...count(b)].sort());
};

await test('absent, empty and a lone marker are the default plan', () => {
  assert.equal(orderPlan(DEFAULT_PLAN, undefined), DEFAULT_PLAN);
  assert.equal(orderPlan(DEFAULT_PLAN, []), DEFAULT_PLAN);
  assert.deepEqual(orderPlan(DEFAULT_PLAN, ['...']), DEFAULT_PLAN);
});

await test('the steps named go in the user order, the rest keep their order where the marker stands', () => {
  const first = orderPlan(DEFAULT_PLAN, ['drop:speed']);
  assert.equal(first[0], 'drop:speed');
  assert.deepEqual(
    first.slice(1),
    DEFAULT_PLAN.filter((step) => step !== 'drop:speed'),
  );
  const last = orderPlan(DEFAULT_PLAN, ['...', 'drop:cost']);
  assert.equal(last.at(-1), 'drop:cost');
  assert.deepEqual(
    last.slice(0, -1),
    DEFAULT_PLAN.filter((step) => step !== 'drop:cost'),
  );
  const both = orderPlan(DEFAULT_PLAN, ['drop:speed', '...', 'drop:cost']);
  assert.equal(both[0], 'drop:speed');
  assert.equal(both.at(-1), 'drop:cost');
});

await test('every ordering keeps the plan complete: the same steps as often as the default has them', () => {
  const lists = [
    ['drop:cost'],
    ['shorten:quota'],
    ['shorten:quota', 'shorten:quota', '...', 'drop:branch'],
    [...DEFAULT_PLAN].reverse(),
    ['...', ...DEFAULT_PLAN.slice(0, 5)],
  ];
  for (const list of lists) {
    const clean = list.filter((step) => step === '...' || STEP_NAMES.has(step));
    parseShrink(clean);
    sameSteps(
      orderPlan(DEFAULT_PLAN, clean).filter((step) => step !== '...'),
      DEFAULT_PLAN,
    );
  }
});

await test('a name used fewer times than the plan has it leaves the other occurrences in place', () => {
  const plan = orderPlan(DEFAULT_PLAN, ['shorten:quota']);
  assert.equal(plan[0], 'shorten:quota');
  assert.equal(count(plan).get('shorten:quota'), count(DEFAULT_PLAN).get('shorten:quota'));
  assert.deepEqual(plan.slice(1, 2), [DEFAULT_PLAN[1]], 'the others stay at their default place');
});

await test('bad input is rejected with a short message', () => {
  const bad: unknown[] = [
    'drop:cost',
    { 0: 'drop:cost' },
    [1],
    ['drop:nobody'],
    ['drop:workspace'],
    ['drop:cost', 'drop:cost'],
    ['...', '...'],
    Array.from({ length: 65 }, () => '...'),
    ['x'.repeat(500)],
  ];
  for (const value of bad)
    assert.throws(() => parseShrink(value), Error, JSON.stringify(value).slice(0, 30));
  try {
    parseShrink(['x'.repeat(500)]);
  } catch (error) {
    assert.ok((error as Error).message.length < 80);
  }
  assert.deepEqual(parseShrink(['...', 'drop:cost']), ['...', 'drop:cost']);
  assert.deepEqual(parseShrink([]), []);
});

await test('settings and the session configuration accept it, the session wins, and it merges with the rest', () => {
  const settings = parseSettings({ version: 1, slots: {}, shrink: ['...', 'drop:cost'] });
  assert.deepEqual(settings.shrink, ['...', 'drop:cost']);
  assert.throws(() => parseSettings({ version: 1, slots: {}, shrink: ['nope'] }));
  assert.throws(() => parseSettings({ version: 1, slots: {}, shrinks: [] }), /Unknown setting/u);
  const session = parseFooterConfig({ shrink: ['drop:speed'] });
  assert.deepEqual(session.shrink, ['drop:speed']);
  assert.throws(() => parseFooterConfig({ shrink: ['nope'] }));
  assert.deepEqual(applySettings(defaultFooterConfig(), settings).shrink, ['...', 'drop:cost']);
  assert.deepEqual(applySettings(session, settings).shrink, ['drop:speed'], 'the session wins');
  assert.equal(applySettings(defaultFooterConfig(), defaultSettings()).shrink, undefined);
});

const draw = (width: number, shrink?: string[]) =>
  layoutFooter(withCost, width, {
    paint,
    glyphs: portableGlyphs,
    now: NOW,
    config: { ...defaultFooterConfig(), ...(shrink ? { shrink } : {}) },
  });
const targets = (width: number, shrink?: string[]): Set<string> =>
  new Set(draw(width, shrink).hitRegions.map((region) => region.target));

await test('the footer without a setting is what it was; with the cost last it keeps the cost longer', () => {
  for (const width of [60, 100, 140, 160, 180, 220])
    assert.deepEqual(draw(width).lines, draw(width, []).lines, `${width}`);
  const rows = (shrink?: string[]) =>
    Array.from({ length: 160 }, (_, index) => 80 + index).filter((width) =>
      targets(width, shrink).has('cost'),
    );
  const byDefault = rows();
  const kept = rows(['...', 'drop:cost']);
  assert.ok(kept.length > byDefault.length, 'the cost is shown at more widths');
  assert.ok(Math.min(...kept) < Math.min(...byDefault), 'and at narrower ones');
  assert.ok(
    byDefault.every((width) => kept.includes(width)),
    'never at fewer',
  );
});

await test('with the speed first to go, it goes before the cost and the quota is unchanged by it', () => {
  const withSpeed = { ...withCost, outputTokensPerSecond: 84.2 };
  const at = (width: number, shrink?: string[]) =>
    stripVTControlCharacters(
      layoutFooter(withSpeed, width, {
        paint,
        glyphs: portableGlyphs,
        now: NOW,
        config: { ...defaultFooterConfig(), ...(shrink ? { shrink } : {}) },
      }).lines[1] ?? '',
    );
  const widths = Array.from({ length: 120 }, (_, index) => 100 + index);
  const dropped = widths.filter(
    (width) => at(width).includes('tok/s') && !at(width, ['drop:speed']).includes('tok/s'),
  );
  assert.ok(dropped.length > 0, 'at some widths the speed goes sooner');
  assert.ok(
    widths.every(
      (width) => !at(width, ['drop:speed']).includes('tok/s') || at(width).includes('tok/s'),
    ),
    'and is never shown where the default drops it',
  );
});

await test('with a user plan the footer properties hold at every width', () => {
  const plans = [
    ['...', 'drop:cost'],
    ['drop:speed', '...', 'drop:cost'],
    [...DEFAULT_PLAN].reverse(),
  ];
  for (const plan of plans) {
    parseShrink(plan);
    let previous = new Set<string>();
    for (let width = 1; width <= 240; width += 1) {
      const layout = draw(width, plan);
      assert.equal(layout.lines.length, 2);
      for (const line of layout.lines) {
        assert.ok(visibleWidth(line) <= width, `${width}: too wide`);
        assert.doesNotMatch(
          stripVTControlCharacters(line).trim(),
          /^│|│$|│\s*│/u,
          `${width}: separator`,
        );
      }
      for (const region of layout.hitRegions)
        assert.ok(region.x >= 0 && region.x + region.width <= width, `${width}: region`);
      const now = new Set([...targets(width, plan)].filter((id) => id !== 'quota-more'));
      for (const id of previous)
        assert.ok(now.has(id), `${width}: ${id} vanished as the terminal widened`);
      previous = now;
    }
  }
});

await test('every step name is documented', () => {
  const docs = readFileSync(new URL('../docs/footer-configuration.md', import.meta.url), 'utf8');
  for (const step of STEP_NAMES)
    assert.ok(docs.includes(`\`${step}\``), `${step} is not documented`);
});
