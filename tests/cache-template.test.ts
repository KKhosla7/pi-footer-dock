import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readCacheUsage } from '../src/core/cache-usage.js';
import { defaultFooterConfig, parseFooterConfig } from '../src/core/footer-config.js';
import { renderSegment } from '../src/ui/segments.js';
import { nerdGlyphs } from '../src/ui/glyphs.js';
import { demoSnapshot } from './reference.js';

await test('new cache templates are opt-in, factual and show unknown reuse for ambiguous zero', () => {
  const config = parseFooterConfig({
    ...defaultFooterConfig(),
    slots: {
      cache: { text: '{cachereuse} R{cacheread} W{cachewrite} U{cacheinput}' },
    },
  });
  const render = (read: number) =>
    renderSegment(
      'cache',
      {
        ...demoSnapshot,
        cacheUsage: readCacheUsage({ input: 100, cacheRead: read, cacheWrite: 100 }),
      },
      { paint: (text) => text, glyphs: nerdGlyphs },
      { config, look: 'xl' },
    ).text;
  assert.equal(render(800), '80% R800 W100 U100');
  assert.equal(render(0), '— R0 W100 U100');
  assert.ok(!defaultFooterConfig().slots.cache?.text);
});
