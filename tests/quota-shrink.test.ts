import assert from 'node:assert/strict';
import { stripVTControlCharacters } from 'node:util';
import { test } from 'node:test';
import { visibleWidth } from '@earendil-works/pi-tui';
import { QUOTA_TOGGLE, defaultFooterConfig, slotOptions } from '../src/core/footer-config.js';
import type { RateLimitWindow } from '../src/core/rate-limits.js';
import { portableGlyphs } from '../src/ui/glyphs.js';
import { layoutFooter } from '../src/ui/layout.js';
import { renderQuota } from '../src/ui/quota.js';
import { demoSnapshot } from './reference.js';

const NOW = 1_800_000_000;
const options = { paint: (text: string) => text, glyphs: portableGlyphs, now: NOW * 1000 };
const slot = slotOptions(defaultFooterConfig(), 'quota');
function render(windows: RateLimitWindow[], budget: number): string {
  const snapshot = {
    ...demoSnapshot,
    rateLimits: { provider: 'opencode-go', model: 'm', windows },
  };
  return stripVTControlCharacters(renderQuota(snapshot, options, { icon: '', budget, slot }));
}
/** The state a live OpenCode Go account reported: monthly cap exhausted. */
const blocked: RateLimitWindow[] = [
  { label: '5h', remainingPercent: 100, resetAt: NOW + 18_000 },
  { label: 'week', remainingPercent: 100, resetAt: NOW + 68_940 },
  { label: 'month', remainingPercent: 0, resetAt: NOW + 446_400, badge: 'rate-limited' },
];
const healthy: RateLimitWindow[] = [
  { label: '5h', remainingPercent: 94, resetAt: NOW + 7140 },
  { label: 'week', remainingPercent: 48, resetAt: NOW + 282_000 },
  { label: 'month', remainingPercent: 53, resetAt: NOW + 1_641_000 },
];

await test('the full form reads in words, in 5h, week, month order', () => {
  const text = render(blocked, Infinity);
  assert.equal(
    text,
    '5h ▰▰▰▰▰▰▰ 100% left ◌ resets in 5h 0m   │   ' +
      'week ▰▰▰▰▰▰▰ 100% left ◌ resets in 19h 9m   │   ' +
      'month ▱▱▱▱▱▱▱ 0% left ◌ resets in 5d 4h',
  );
  assert.equal(
    render(healthy, Infinity),
    '5h ▰▰▰▰▰▰▰ 94% left ◌ resets in 1h 59m   │   ' +
      'week ▰▰▰▱▱▱▱ 48% left ◌ resets in 3d 6h   │   ' +
      'month ▰▰▰▰▱▱▱ 53% left ◌ resets in 18d 23h',
  );
});

await test('at the budget a 140-column footer leaves, all three windows keep their bars and "left"', () => {
  const text = render(blocked, 98);
  assert.match(text, /5h ▰{7} 100% left/u);
  assert.match(text, /week ▰{7} 100% left/u);
  assert.match(text, /month ▱{7} 0% left/u);
  assert.ok(visibleWidth(text) <= 98);
});

await test('whatever the width, the order is natural and the output never overflows', () => {
  for (const windows of [blocked, healthy]) {
    for (let budget = 20; budget <= 260; budget += 1) {
      const text = render(windows, budget);
      assert.ok(visibleWidth(text) <= budget || text.startsWith('quota'), `fits ${budget}`);
      const positions = ['5h', 'week', 'month']
        .map((label) => text.search(new RegExp(`(^|│ +)${label} `, 'u')))
        .filter((position) => position >= 0);
      assert.deepEqual(
        positions,
        [...positions].sort((a, b) => a - b),
        `order at ${budget}`,
      );
    }
  }
});

await test('the blocking window survives every width that shows anything', () => {
  for (let budget = 24; budget <= 260; budget += 1) {
    const text = render(blocked, budget);
    assert.match(text, /month (?:▱{7} )?0%/u, `blocked month visible at ${budget}`);
  }
});

await test('healthy windows give up detail first: reset words, then reset, meter and wording', () => {
  const widths = [200, 120, 100, 70, 48];
  const seen = widths.map((budget) => render(healthy, budget));
  assert.ok((seen[0] ?? '').includes('resets in'));
  assert.ok(seen.some((text) => /◌ \d/u.test(text) && !text.includes('resets in')));
  assert.ok(seen.some((text) => text.includes('▰') && !text.includes('◌')));
  assert.ok(seen.some((text) => !/▰|▱/u.test(text) && text.includes('left')));
  assert.ok(seen.every((text) => visibleWidth(text) <= 200));
});

const line = (layout: ReturnType<typeof layoutFooter>, row: number) =>
  stripVTControlCharacters(layout.lines[row] ?? '');
function footerAt(width: number) {
  const snapshot = {
    ...demoSnapshot,
    rateLimits: { provider: 'opencode-go', model: 'm', windows: blocked },
  };
  return layoutFooter(snapshot, width, { ...options, config: defaultFooterConfig() });
}

await test('the footer never overflows and nothing reappears as the window narrows', () => {
  let previous: Set<string> | undefined;
  for (let width = 260; width >= 20; width -= 1) {
    const layout = footerAt(width);
    for (const text of layout.lines) assert.ok(visibleWidth(text) <= width, `fits ${width}`);
    const visible = new Set(layout.hitRegions.map((region) => region.target));
    // The chevron legitimately appears once the quota collapses; every other item only leaves.
    if (previous)
      for (const id of visible)
        assert.ok(previous.has(id) || id === QUOTA_TOGGLE, `${id} reappeared at ${width}`);
    previous = visible;
  }
});

await test('no value is cut mid-value while the essentials fit, and the project name survives longest', () => {
  for (let width = 70; width <= 260; width += 1) {
    const layout = footerAt(width);
    for (const text of layout.lines) assert.ok(!/…\s*$/u.test(text), `no cut at ${width}`);
    const ids = new Set(layout.hitRegions.map((region) => region.target));
    // A window is only ever left out together with the › that brings it back.
    assert.ok(
      /month (?:▱{7} )?0%/u.test(line(layout, 1)) || ids.has('quota-more'),
      `month is visible or recoverable at ${width}`,
    );
    for (const id of ['workspace', 'branch', 'model', 'context-usage', 'quota'])
      assert.ok(ids.has(id), `${id} present at ${width}`);
  }
  for (let width = 30; width < 70; width += 1) {
    const layout = footerAt(width);
    const ids = new Set(layout.hitRegions.map((region) => region.target));
    assert.ok(ids.has('workspace') || ids.has('model'), `something essential at ${width}`);
  }
});

await test('each row picks its own look: the short first row stays rich while row two shortens', () => {
  const layout = footerAt(180);
  assert.match(line(layout, 0), /opencode-go\/deepseek-v4\.1-flash/u, 'row one keeps the provider');
  assert.doesNotMatch(line(layout, 1), /compacts in/u, 'row two already dropped compaction');
});

await test('hideAt hides a slot at that look and narrower, on the real layout', () => {
  const config = { ...defaultFooterConfig(), slots: { branch: { hideAt: 'md' as const } } };
  const snapshot = { ...demoSnapshot, rateLimits: { provider: 'x', model: 'm', windows: healthy } };
  const wide = layoutFooter(snapshot, 220, { ...options, config });
  assert.ok(wide.hitRegions.some((region) => region.target === 'branch'));
  const narrow = layoutFooter(snapshot, 100, { ...options, config });
  assert.ok(!narrow.hitRegions.some((region) => region.target === 'branch'));
});

await test('within a row a less important item never outlives a more important one', () => {
  // Owner ranking, per row: project, branch, model, thinking on the first; limit, context on the second.
  const rows = [
    ['workspace', 'branch', 'model', 'thinking'],
    ['quota', 'context-usage'],
  ];
  const pairs = rows.flatMap((rank) =>
    rank.flatMap((higher, index) => rank.slice(index + 1).map((lower) => ({ higher, lower }))),
  );
  for (let width = 16; width <= 260; width += 1) {
    const visible = new Set(footerAt(width).hitRegions.map((region) => region.target));
    for (const { higher, lower } of pairs)
      assert.ok(
        !visible.has(lower) || visible.has(higher),
        `${lower} without ${higher} at ${width}`,
      );
  }
});

await test('the project name outlives everything, and a row that fits is not emptied', () => {
  for (let width = 16; width <= 260; width += 1) {
    const visible = new Set(footerAt(width).hitRegions.map((region) => region.target));
    if (visible.size > 0) assert.ok(visible.has('workspace'), `project survives at ${width}`);
  }
  // Row 1 has to drop items at 50 columns; row 2 fits on its own line and keeps its values.
  const targets = footerAt(50).hitRegions.filter((region) => region.y === 1);
  assert.ok(targets.length > 0, 'row 2 keeps something at 50 columns');
});
