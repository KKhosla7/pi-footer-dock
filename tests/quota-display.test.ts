import { rowLabel } from '../src/core/settings-labels.js';
import assert from 'node:assert/strict';
import { stripVTControlCharacters } from 'node:util';
import { test } from 'node:test';
import { visibleWidth } from '@earendil-works/pi-tui';
import { defaultFooterConfig } from '../src/core/footer-config.js';
import type { FooterConfig } from '../src/core/footer-config.js';
import { compose } from '../src/core/explain/explainer.js';
import { quota } from '../src/core/explain/items/quota.js';
import { renderBlocks } from '../src/core/explain/render.js';
import { nerdGlyphs, portableGlyphs } from '../src/ui/glyphs.js';
import { layoutFooter } from '../src/ui/layout.js';
import { plainStyle } from '../src/ui/explain-style.js';
import { demoSnapshot } from './reference.js';

const NOW = 4_000_000_000_000;
const WORDS = /\b(?:left|used|resets in)\b/u;
const configFor = (wording?: 'used'): FooterConfig => ({
  ...defaultFooterConfig(),
  slots: wording ? { quota: { wording } } : {},
});
const quotaRow = (width: number, wording?: 'used', expanded = false): string => {
  const layout = layoutFooter(demoSnapshot, width, {
    paint: (text) => text,
    glyphs: portableGlyphs,
    now: NOW,
    quotaExpanded: expanded,
    config: configFor(wording),
  });
  return stripVTControlCharacters(layout.lines[1] ?? '');
};

await test('the quota never prints "left", "used" or "resets in", in either mode, at any width', () => {
  for (const wording of [undefined, 'used'] as const)
    for (const expanded of [false, true])
      for (let width = 20; width <= 2000; width += width < 300 ? 1 : 97) {
        const row = quotaRow(width, wording, expanded);
        assert.doesNotMatch(row, WORDS, `${wording ?? 'left'} ${expanded} ${width}`);
        assert.ok(visibleWidth(row) <= width, `fits ${width}`);
      }
});

await test('a window reads: name, bar, percent, reset icon, time; the separator slims before anything is dropped', () => {
  const wide = quotaRow(300);
  assert.match(
    wide,
    /5h ▰▰▱▱▱▱▱ 34% ↻ 2h 15m {3}│ {3}week ▰▰▰▱▱▱▱ 48% ↻ 3d 10h {3}│ {3}month ▰▱▱▱▱▱▱ 18% ↻ 14d 0h/u,
  );
  const slim = quotaRow(150);
  assert.match(
    slim,
    /5h ▰▰▱▱▱▱▱ 34% ↻ 2h 15m │ week ▰▰▰▱▱▱▱ 48% ↻ 3d 10h │ month ▰▱▱▱▱▱▱ 18% ↻ 14d 0h/u,
  );
});

await test('the meter goes before the reset time, so the time outlives the meter', () => {
  let sawNoMeterWithTime = false;
  for (let width = 20; width <= 300; width += 1) {
    const row = quotaRow(width, undefined, true);
    const [meter, time] = [/▰|▱/u.test(row), /↻ \d/u.test(row)];
    if (meter) assert.ok(time, `a meter without the time at ${width}`);
    if (!meter && time) sawNoMeterWithTime = true;
  }
  assert.ok(sawNoMeterWithTime, 'there is a width where the time outlives the meter');
});

await test('"used" shows the used share in the number and the bar, and the colour follows what is left', () => {
  const left = quotaRow(300);
  const used = quotaRow(300, 'used');
  assert.match(left, /5h ▰▰▱▱▱▱▱ 34%/u);
  assert.match(used, /5h ▰▰▰▰▰▱▱ 66%/u);
  assert.match(used, /month ▰▰▰▰▰▰▱ 82%/u);
});

await test('the reset icon is the reload icon in both the Nerd set and the plain one', () => {
  assert.equal(nerdGlyphs.reset, '\u{f0453}');
  assert.equal(portableGlyphs.reset, '↻');
});

const explained = (quotaShows?: 'left' | 'used'): string => {
  const doc = compose(quota, {
    snapshot: demoSnapshot,
    now: NOW,
    value: 'x',
    ascii: false,
    ...(quotaShows ? { quotaShows } : {}),
  });
  return renderBlocks([...doc.headline, ...doc.body], plainStyle, 100).join('\n');
};

await test('the explainer says whether the footer number is left or used, and where to change it', () => {
  const left = explained();
  assert.match(left, /In the footer/u);
  assert.match(left, /the percent left, then the reload icon/u);
  assert.match(left, new RegExp(rowLabel('wording'), 'u'));
  assert.match(left, /dock-settings/u);
  const used = explained('used');
  assert.match(used, /the percent used, then the reload icon/u);
  assert.match(used, /The number is what is used/u);
  assert.match(used, new RegExp(`"${rowLabel('wording')}": left`, 'u'));
});
