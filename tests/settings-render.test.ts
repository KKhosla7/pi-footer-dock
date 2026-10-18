import assert from 'node:assert/strict';
import { stripVTControlCharacters } from 'node:util';
import { test } from 'node:test';
import { visibleWidth } from '@earendil-works/pi-tui';
import { QUOTA_TOGGLE, defaultFooterConfig } from '../src/core/footer-config.js';
import type { FooterConfig } from '../src/core/footer-config.js';
import type { RateLimitWindow } from '../src/core/rate-limits.js';
import { applySettings, defaultSettings, withSlot } from '../src/core/settings.js';
import type { Settings } from '../src/core/settings.js';
import { portableGlyphs } from '../src/ui/glyphs.js';
import { layoutFooter } from '../src/ui/layout.js';
import { demoSnapshot } from './reference.js';

const NOW = 1_800_000_000;
const windows: RateLimitWindow[] = [
  { label: '5h', remainingPercent: 100, resetAt: NOW + 18_000 },
  { label: 'week', remainingPercent: 80, resetAt: NOW + 68_940 },
  { label: 'month', remainingPercent: 0, resetAt: NOW + 446_400, badge: 'rate-limited' },
];
const snapshot = { ...demoSnapshot, rateLimits: { provider: 'p', model: 'm', windows } };
const options = { paint: (text: string) => text, glyphs: portableGlyphs, now: NOW * 1000 };
function footer(width: number, settings: Settings, expanded = false) {
  const config: FooterConfig = applySettings(defaultFooterConfig(), settings);
  const layout = layoutFooter(snapshot, width, { ...options, quotaExpanded: expanded, config });
  const lines = layout.lines.map((line) => stripVTControlCharacters(line));
  return {
    lines,
    text: lines.join('\n'),
    targets: new Set(layout.hitRegions.map((r) => r.target)),
  };
}

await test('hidden at xl removes the item at every width and nothing else', () => {
  const settings = withSlot(defaultSettings(), 'cache', { hideAt: 'xl' });
  for (let width = 20; width <= 260; width += 1) {
    const view = footer(width, settings);
    assert.ok(!view.targets.has('cache'), `cache hidden at ${width}`);
    for (const line of view.lines) assert.ok(visibleWidth(line) <= width, `fits ${width}`);
  }
  assert.ok(footer(260, defaultSettings()).targets.has('cache'));
});

await test('hidden from a look removes the item there and narrower, not before', () => {
  const settings = withSlot(defaultSettings(), 'input', { hideAt: 'lg' });
  assert.ok(footer(260, settings).targets.has('input'), 'still shown at xl');
  assert.ok(!footer(150, settings).targets.has('input'), 'gone below xl');
});

await test('hiding the project name is allowed and leaves the rest of the footer', () => {
  const view = footer(120, withSlot(defaultSettings(), 'workspace', { hideAt: 'xl' }));
  assert.ok(!view.targets.has('workspace'));
  assert.ok(view.targets.has('branch') && view.targets.has('quota'));
});

await test('a hidden quota window disappears with the chevron following the visible count', () => {
  const month = withSlot(defaultSettings(), 'quota', { hideWindows: ['month'] });
  const wide = footer(260, month);
  assert.doesNotMatch(wide.text, /month/u);
  assert.match(wide.text, /5h/u);
  assert.match(wide.text, /week/u);
  const narrow = footer(60, month);
  assert.doesNotMatch(narrow.text, /month/u);
  assert.ok(narrow.targets.has(QUOTA_TOGGLE), 'two windows left still collapse and expand');
  const single = withSlot(defaultSettings(), 'quota', { hideWindows: ['5h', 'week'] });
  for (let width = 20; width <= 260; width += 1) {
    const view = footer(width, single);
    assert.ok(!view.targets.has(QUOTA_TOGGLE), `no chevron for one window at ${width}`);
    assert.doesNotMatch(view.text, /5h|week/u);
  }
});

await test('hiding every window shows nothing rather than "unavailable"', () => {
  const none = withSlot(defaultSettings(), 'quota', { hideWindows: ['5h', 'week', 'month'] });
  const view = footer(200, none);
  assert.doesNotMatch(view.text, /unavailable|month|5h|week/u);
  assert.ok(!view.targets.has('quota') && !view.targets.has(QUOTA_TOGGLE));
});

await test('the chevron is hidden with the quota, at the same looks', () => {
  const hidden = withSlot(defaultSettings(), 'quota', { hideAt: 'sm' });
  assert.ok(!footer(40, hidden).targets.has(QUOTA_TOGGLE));
  assert.ok(!footer(40, hidden).targets.has('quota'));
});

await test('"used" wording mirrors the number and the label, and shows what is spent', () => {
  const used = withSlot(defaultSettings(), 'quota', { wording: 'used' });
  const text = footer(260, used).text;
  assert.match(text, /5h .*0% used/u);
  assert.match(text, /week .*20% used/u);
  assert.match(text, /month .*100% used/u);
  assert.doesNotMatch(text, / left/u);
  assert.match(footer(260, defaultSettings()).text, /month .*0% left/u);
});

await test('"always collapsed" leaves out the last window with a › at any width, and › brings it back', () => {
  const always = withSlot(defaultSettings(), 'quota', { collapse: 'always' });
  for (const width of [260, 200, 140]) {
    const view = footer(width, always);
    assert.match(view.text, /5h/u, `the first windows are shown at ${width}`);
    assert.match(view.text, /week/u);
    assert.doesNotMatch(view.text, /month/u, `the last is left out at ${width}`);
    assert.match(view.text, /›/u);
    assert.ok(view.targets.has(QUOTA_TOGGLE));
    const open = footer(width, always, true);
    assert.match(open.text, /5h/u);
    assert.match(open.text, /week/u);
    assert.match(open.text, /month/u);
    assert.match(open.text, /‹/u);
  }
  assert.doesNotMatch(footer(260, defaultSettings()).text, /›/u, 'off by default');
});

await test('"always collapsed" follows the quota being hidden or having a single window', () => {
  const always = { collapse: 'always' as const };
  assert.ok(
    !footer(260, withSlot(defaultSettings(), 'quota', { ...always, hideAt: 'xl' })).targets.has(
      QUOTA_TOGGLE,
    ),
  );
  const one = withSlot(defaultSettings(), 'quota', { ...always, hideWindows: ['5h', 'week'] });
  const view = footer(260, one);
  assert.ok(!view.targets.has(QUOTA_TOGGLE));
  assert.match(view.text, /month/u);
});

await test('the user picks which windows stay when collapsed, and the › brings back the rest', () => {
  const pick = (labels: string[]) =>
    withSlot(defaultSettings(), 'quota', { collapse: 'always', collapsedShow: labels });
  const first = footer(260, pick(['5h']));
  assert.match(first.text, /5h/u);
  assert.doesNotMatch(first.text, /week|month/u, 'only the picked window stays');
  assert.match(first.text, /›/u);
  const monthOnly = footer(260, pick(['month']));
  assert.match(monthOnly.text, /month/u);
  assert.doesNotMatch(monthOnly.text, /5h|week/u);
  const open = footer(260, pick(['5h']), true);
  for (const label of ['5h', 'week', 'month']) assert.match(open.text, new RegExp(label, 'u'));
  assert.match(open.text, /‹/u);
});

await test('picking every window leaves nothing to collapse, so no ›; picking none keeps only the ›', () => {
  const all = footer(
    260,
    withSlot(defaultSettings(), 'quota', {
      collapse: 'always',
      collapsedShow: ['5h', 'week', 'month'],
    }),
  );
  assert.ok(!all.targets.has(QUOTA_TOGGLE));
  assert.match(all.text, /month/u);
  const none = footer(
    260,
    withSlot(defaultSettings(), 'quota', { collapse: 'always', collapsedShow: [] }),
  );
  assert.ok(none.targets.has(QUOTA_TOGGLE), 'the › is still there to bring them back');
  assert.ok(!none.targets.has('quota'));
  assert.doesNotMatch(none.text, /5h|week|month/u);
});

await test('a pick that names a window the provider does not publish is ignored', () => {
  const view = footer(
    260,
    withSlot(defaultSettings(), 'quota', { collapse: 'always', collapsedShow: ['5h', 'year'] }),
  );
  assert.match(view.text, /5h/u);
  assert.doesNotMatch(view.text, /year|week|month/u);
});

await test('compaction shows tokens by default and the point as a percent on request', () => {
  const view = { ...snapshot, tokens: 10_000, compactRemaining: 112_000, compactAt: 98 };
  const render = (settings: Settings) => {
    const config = applySettings(defaultFooterConfig(), settings);
    const layout = layoutFooter(view, 260, { ...options, quotaExpanded: false, config });
    return layout.lines.map((line) => stripVTControlCharacters(line)).join('\n');
  };
  assert.match(render(defaultSettings()), /compacts in 112k/u);
  const percent = render(withSlot(defaultSettings(), 'compaction', { unit: 'percent' }));
  assert.match(percent, /compacts at 98%/u);
  assert.doesNotMatch(percent, /compacts in/u);
  const unknown = { ...view, compactAt: null };
  const config = applySettings(
    defaultFooterConfig(),
    withSlot(defaultSettings(), 'compaction', { unit: 'percent' }),
  );
  const text = layoutFooter(unknown, 260, { ...options, quotaExpanded: false, config }).lines.join(
    '\n',
  );
  assert.match(stripVTControlCharacters(text), /awaiting usage/u);
});
