import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stripVTControlCharacters } from 'node:util';
import { visibleWidth } from '@earendil-works/pi-tui';
import { layoutFooter } from '../src/ui/layout.js';
import { nerdGlyphs, portableGlyphs } from '../src/ui/glyphs.js';
import { parseFooterConfig } from '../src/core/footer-config.js';
import { demoSnapshot, withCost } from './reference.js';

await test('provider/thinking and quota/estimate groups independently end at the terminal right edge', () => {
  for (const glyphs of [nerdGlyphs, portableGlyphs]) {
    for (const width of [100, 140, 220]) {
      for (const model of ['tiny', 'a-much-longer-model-name']) {
        const layout = layoutFooter(
          { ...withCost, provider: 'openai', model, thinking: 'medium' },
          width,
          { paint: (text) => text, glyphs, now: 4_000_000_000_000 },
        );
        assert.equal(
          visibleWidth(stripVTControlCharacters(layout.lines[0] ?? '').trimEnd()),
          width,
        );
        assert.equal(
          visibleWidth(stripVTControlCharacters(layout.lines[1] ?? '').trimEnd()),
          width,
        );
        const thinking = layout.hitRegions.find((region) => region.target === 'thinking');
        const quota = layout.hitRegions.find((region) => region.target === 'cost');
        assert.ok(thinking);
        assert.ok(quota);
        assert.equal(thinking.x + thinking.width, width);
        assert.equal(quota.x + quota.width, width);
      }
    }
  }
});

await test('custom right groups use row-specific offsets and leave the inter-group gutter outside hit regions', () => {
  const config = parseFooterConfig({
    rows: [
      { left: ['workspace'], right: ['short'] },
      { left: ['context'], right: ['long'] },
    ],
    slots: { short: { text: '界' }, long: { text: 'A much longer value' } },
  });
  const layout = layoutFooter(demoSnapshot, 100, {
    paint: (text) => text,
    glyphs: nerdGlyphs,
    config,
  });
  const short = layout.hitRegions.find((region) => region.target === 'short');
  const long = layout.hitRegions.find((region) => region.target === 'long');
  assert.ok(short);
  assert.ok(long);
  assert.equal(short.x, 98);
  assert.equal(short.width, 2);
  assert.equal(long.x + long.width, 100);
  assert.notEqual(short.x, long.x);
  assert.ok(
    !layout.hitRegions.some(
      (region) =>
        region.y === 0 && short.x - 1 >= region.x && short.x - 1 < region.x + region.width,
    ),
  );
});
