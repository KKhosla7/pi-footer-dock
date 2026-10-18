import assert from 'node:assert/strict';
import { stripVTControlCharacters } from 'node:util';
import { test } from 'node:test';
import { visibleWidth } from '@earendil-works/pi-tui';
import { QUOTA_TOGGLE, defaultFooterConfig } from '../src/core/footer-config.js';
import { LOOKS } from '../src/core/looks.js';
import type { Look } from '../src/core/looks.js';
import type { RateLimitWindow } from '../src/core/rate-limits.js';
import { portableGlyphs } from '../src/ui/glyphs.js';
import { layoutFooter } from '../src/ui/layout.js';
import { DockFooter } from '../src/ui/footer.js';
import { renderSegment } from '../src/ui/segments.js';
import { demoSnapshot } from './reference.js';

const NOW = 1_800_000_000;
const config = defaultFooterConfig();
const windows: RateLimitWindow[] = [
  { label: '5h', remainingPercent: 100, resetAt: NOW + 18_000 },
  { label: 'week', remainingPercent: 80, resetAt: NOW + 68_940 },
  { label: 'month', remainingPercent: 0, resetAt: NOW + 446_400, badge: 'rate-limited' },
];
const withWindows = (list: RateLimitWindow[]) => ({
  ...demoSnapshot,
  rateLimits: { provider: 'opencode-go', model: 'm', windows: list },
});
const options = (quotaExpanded: boolean) => ({
  paint: (text: string) => text,
  glyphs: portableGlyphs,
  now: NOW * 1000,
  quotaExpanded,
});
const text = (id: string, look: Look, expanded: boolean, list = windows) =>
  stripVTControlCharacters(
    renderSegment(id, withWindows(list), options(expanded), { config, look }).text,
  );
const collapsedLooks: Look[] = ['sm', 'xs'];
const richLooks = LOOKS.filter((look) => !collapsedLooks.includes(look));

await test('xl, lg and md show every window and no chevron, expanded or not', () => {
  for (const look of richLooks) {
    assert.equal(text('quota', look, true), text('quota', look, false), look);
    assert.equal(text(QUOTA_TOGGLE, look, false), '', `${look} has no chevron`);
    for (const label of ['5h', 'week', 'month'])
      assert.match(text('quota', look, false), new RegExp(label, 'u'));
  }
});

await test('collapsed at sm and xs: the last window is left out, with a › to bring it back', () => {
  for (const look of collapsedLooks) {
    const quota = text('quota', look, false);
    assert.match(quota, /5h/u, `${look} keeps the first windows`);
    assert.match(quota, /week/u);
    assert.doesNotMatch(quota, /month/u, `${look} leaves out the last one`);
    assert.equal(text(QUOTA_TOGGLE, look, false).trim(), '›');
  }
});

await test('expanded at sm and xs: every window, with a ‹ to collapse', () => {
  for (const look of collapsedLooks) {
    const quota = text('quota', look, true);
    for (const label of ['5h', 'week', 'month']) assert.match(quota, new RegExp(label, 'u'));
    assert.equal(text(QUOTA_TOGGLE, look, true).trim(), '‹');
  }
});

await test('a single live window has nothing to toggle', () => {
  const single = windows.slice(2);
  for (const look of LOOKS) {
    assert.equal(text(QUOTA_TOGGLE, look, false, single), '', look);
    assert.match(text('quota', look, false, single), /month/u);
  }
});

await test('the chevron is a three-column click target, and expired windows do not count', () => {
  assert.equal(visibleWidth(text(QUOTA_TOGGLE, 'sm', false)), 3);
  const expired = [windows[0], { ...windows[1], resetAt: NOW - 1 }] as RateLimitWindow[];
  assert.equal(text(QUOTA_TOGGLE, 'sm', false, expired), '');
});

function footer(width: number, expanded: boolean) {
  return layoutFooter(withWindows(windows), width, { ...options(expanded), config });
}
const plain = (lines: string[]) => lines.map((line) => stripVTControlCharacters(line));

await test('an expanded quota never disappears where the collapsed one is shown', () => {
  for (let width = 16; width <= 260; width += 1) {
    const collapsed = new Set(footer(width, false).hitRegions.map((region) => region.target));
    const expanded = new Set(footer(width, true).hitRegions.map((region) => region.target));
    if (collapsed.has('quota')) assert.ok(expanded.has('quota'), `quota kept at ${width}`);
  }
});

await test('on the real layout the chevron is clickable and toggling twice restores the footer', () => {
  const width = 50;
  const collapsed = footer(width, false);
  assert.ok(collapsed.hitRegions.some((region) => region.target === QUOTA_TOGGLE));
  const expanded = footer(width, true);
  assert.notDeepEqual(plain(expanded.lines), plain(collapsed.lines));
  assert.deepEqual(plain(footer(width, false).lines), plain(collapsed.lines));
});

await test('every width: nothing overflows, the chevron never outlives its quota, project stays', () => {
  for (const expanded of [false, true]) {
    for (let width = 16; width <= 260; width += 1) {
      const layout = footer(width, expanded);
      for (const line of layout.lines) assert.ok(visibleWidth(line) <= width, `fits ${width}`);
      const ids = new Set(layout.hitRegions.map((region) => region.target));
      if (ids.has(QUOTA_TOGGLE)) assert.ok(ids.has('quota'), `chevron alone at ${width}`);
      if (ids.size > 0) assert.ok(ids.has('workspace'), `project at ${width}`);
    }
  }
});

function hitOf(view: DockFooter, width: number) {
  view.render(width);
  const region = layoutFooter(withWindows(windows), width, {
    ...options(false),
    config,
  }).hitRegions.find((candidate) => candidate.target === QUOTA_TOGGLE);
  assert.ok(region, 'a chevron is drawn');
  return region;
}

await test('clicking the rendered › flips the footer to every window and clicking ‹ restores it', () => {
  let expanded = false;
  const view = new DockFooter({
    paint: (value: string) => value,
    glyphs: portableGlyphs,
    now: NOW * 1000,
    snapshot: () => withWindows(windows),
    dispose: () => undefined,
    isInteractive: () => true,
    isQuotaExpanded: () => expanded,
    onActivate: (target: string) => {
      if (target === QUOTA_TOGGLE) expanded = !expanded;
    },
  });
  const width = 50;
  const click = (): void => {
    const region = hitOf(view, width);
    view.handleMouse({
      type: 'click',
      button: 'left',
      x: region.x + 1,
      y: region.y,
      screenX: region.x + 1,
      screenY: region.y,
      width,
      height: 2,
      shift: false,
      alt: false,
      ctrl: false,
    });
  };
  const before = plain(view.render(width));
  click();
  const after = plain(view.render(width));
  assert.notDeepEqual(after, before);
  assert.match(after.join('\n'), /5h/u);
  click();
  assert.deepEqual(plain(view.render(width)), before);
});
