import assert from 'node:assert/strict';
import { stripVTControlCharacters } from 'node:util';
import { test } from 'node:test';
import { visibleWidth } from '@earendil-works/pi-tui';
import { defaultFooterConfig } from '../src/core/footer-config.js';
import type { FooterConfig } from '../src/core/footer-config.js';
import { compose } from '../src/core/explain/explainer.js';
import { quota } from '../src/core/explain/items/quota.js';
import { renderBlocks } from '../src/core/explain/render.js';
import { plainStyle } from '../src/ui/explain-style.js';
import { portableGlyphs } from '../src/ui/glyphs.js';
import { layoutFooter } from '../src/ui/layout.js';
import { demoSnapshot } from './reference.js';

const NOW = 4_000_000_000_000;

const quotaConfig = (layers: Record<string, boolean>): FooterConfig => ({
  ...defaultFooterConfig(),
  slots: { quota: { layers } },
});
const quotaRow = (width: number, layers: Record<string, boolean>): string => {
  const layout = layoutFooter(demoSnapshot, width, {
    paint: (text) => text,
    glyphs: portableGlyphs,
    now: NOW,
    quotaExpanded: true,
    config: quotaConfig(layers),
  });
  return stripVTControlCharacters(layout.lines[1] ?? '');
};

await test('the meter off never prints a bar; the reset off never prints the icon or a time', () => {
  for (let width = 20; width <= 2000; width += width < 300 ? 1 : 97) {
    const noMeter = quotaRow(width, { meter: false });
    const noReset = quotaRow(width, { reset: false });
    const neither = quotaRow(width, { meter: false, reset: false });
    assert.doesNotMatch(noMeter, /▰|▱/u, `${width}`);
    assert.doesNotMatch(noReset, /↻/u, `${width}`);
    assert.doesNotMatch(neither, /▰|▱|↻/u, `${width}`);
    for (const row of [noMeter, noReset, neither])
      assert.ok(visibleWidth(row) <= width, `${width}`);
  }
  assert.match(quotaRow(300, { meter: false }), /5h 34% ↻ 2h 15m {3}│ {3}week 48% ↻ 3d 10h/u);
  assert.match(
    quotaRow(300, { reset: false }),
    /5h ▰▰▱▱▱▱▱ 34% {3}│ {3}week ▰▰▰▱▱▱▱ 48% {3}│ {3}month ▰▱▱▱▱▱▱ 18%/u,
  );
  assert.match(
    quotaRow(300, { meter: false, reset: false }),
    /5h 34% {3}│ {3}week 48% {3}│ {3}month 18%/u,
  );
});

await test('a quota layer that is on is printed wherever the same footer prints it without the setting', () => {
  for (let width = 20; width <= 400; width += 1) {
    const base = quotaRow(width, {});
    const same = quotaRow(width, { meter: true, reset: true });
    assert.equal(same, base, `${width}`);
    if (/↻ \d/u.test(base)) assert.match(quotaRow(width, { meter: false }), /↻ \d/u, `${width}`);
  }
});

await test('the quota explainer describes the parts that are on', () => {
  const said = (layers: Record<string, boolean>): string => {
    const doc = compose(quota, {
      snapshot: demoSnapshot,
      now: NOW,
      value: 'x',
      ascii: false,
      layers,
    });
    return renderBlocks([...doc.headline, ...doc.body], plainStyle, 100).join('\n');
  };
  assert.match(said({}), /its name, a bar, the percent left, then the reload icon/u);
  assert.match(said({ meter: false }), /its name, the percent left, then the reload icon/u);
  assert.doesNotMatch(said({ meter: false }), /a bar/u);
  assert.match(said({ reset: false }), /its name, a bar, the percent left\./u);
  assert.doesNotMatch(said({ meter: false, reset: false }), /reload icon/u);
});
