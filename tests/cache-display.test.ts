import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readCacheUsage } from '../src/core/cache-usage.js';
import { formatCacheReuse, formatCacheSummary } from '../src/core/cache-presentation.js';
import { defaultFooterConfig } from '../src/core/footer-config.js';
import { renderSegment } from '../src/ui/segments.js';
import { nerdGlyphs, portableGlyphs } from '../src/ui/glyphs.js';
import { demoSnapshot } from './reference.js';

await test('stock cache shows latest-response reuse/read/write rather than cumulative session reads', () => {
  for (const glyphs of [nerdGlyphs, portableGlyphs]) {
    const snapshot = {
      ...demoSnapshot,
      cacheUsage: readCacheUsage({ input: 100, cacheRead: 800, cacheWrite: 100 }),
    };
    const rendered = renderSegment(
      'cache',
      snapshot,
      { paint: (text) => text, glyphs },
      {
        config: defaultFooterConfig(),
        look: 'xl',
      },
    ).text;
    assert.equal(rendered, `${glyphs.cache} last 80% · 800 read · 100 written`);
    assert.doesNotMatch(rendered, /723M/u);
  }
});
await test('stock cache preserves unknown counters, normalized zeros and tiny positive reuse', () => {
  const cases = [
    [undefined, 'cache pending'],
    [readCacheUsage({ input: 100, cacheRead: 0, cacheWrite: 0 }), 'last 0%'],
    [readCacheUsage({ input: 9999, cacheRead: 1, cacheWrite: 0 }), 'last <0.1% · 1 read'],
    [readCacheUsage({ input: 0, cacheRead: 800, cacheWrite: null }), 'last 800 read'],
    [readCacheUsage({ input: 100, cacheRead: 222000, cacheWrite: 0 }), 'last <100% · 222k read'],
    [readCacheUsage({ input: 0, cacheRead: 222000, cacheWrite: 0 }), 'last 100% · 222k read'],
    [readCacheUsage({ input: 100, cacheRead: 0, cacheWrite: 100 }), 'last 0% · 100 written'],
    [readCacheUsage({}), 'last cache unavailable'],
  ] as const;
  for (const [cacheUsage, text] of cases) {
    const snapshot = cacheUsage === undefined ? demoSnapshot : { ...demoSnapshot, cacheUsage };
    const actual = renderSegment(
      'cache',
      snapshot,
      { paint: (value) => value, glyphs: portableGlyphs },
      {
        config: defaultFooterConfig(),
        look: 'xl',
      },
    ).text;
    assert.equal(actual, `${portableGlyphs.cache} ${text}`);
  }
});
await test('a zero read is a miss only when the provider has reported reads earlier in the session', () => {
  const never = { ...demoSnapshot.totals, cacheRead: 0 };
  const draw = (cacheUsage: ReturnType<typeof readCacheUsage>, totals = demoSnapshot.totals) =>
    renderSegment(
      'cache',
      { ...demoSnapshot, cacheUsage, totals },
      { paint: (value) => value, glyphs: portableGlyphs },
      { config: defaultFooterConfig(), look: 'xl' },
    ).text;
  const zero = readCacheUsage({ input: 100, cacheRead: 0, cacheWrite: 0 });
  assert.equal(draw(zero), `${portableGlyphs.cache} last 0%`, 'earlier reads: a miss');
  assert.equal(draw(zero, never), `${portableGlyphs.cache} last not reported`, 'never any reads');
  const written = readCacheUsage({ input: 100, cacheRead: 0, cacheWrite: 100 });
  assert.equal(draw(written, never), `${portableGlyphs.cache} last not reported · 100 written`);
});
await test('cache percentages never round non-full reuse to full or small positive reuse to zero', () => {
  for (let i = 1; i < 100_000; i += 1) {
    const result = formatCacheReuse(i / 1000);
    assert.notEqual(result, '100%');
    assert.notEqual(result, '0%');
    assert.notEqual(result, '—');
  }
  assert.equal(formatCacheReuse(100), '100%');
  for (const invalid of [null, undefined, -1, 0, 101, NaN, Infinity])
    assert.equal(formatCacheReuse(invalid), '—');
  assert.equal(formatCacheSummary(null), 'cache pending');
});
await test('custom cache templates and cumulative cache placeholder keep their previous meanings', () => {
  const config = defaultFooterConfig();
  config.slots.cache = {
    icon: '★',
    text: '{icon} total {cache}; {cachereuse} R{cacheread} W{cachewrite}',
  };
  const snapshot = {
    ...demoSnapshot,
    cacheUsage: readCacheUsage({ input: 100, cacheRead: 800, cacheWrite: 100 }),
  };
  const actual = renderSegment(
    'cache',
    snapshot,
    { paint: (text) => text, glyphs: portableGlyphs },
    {
      config,
      look: 'xl',
    },
  ).text;
  assert.equal(actual, '★ total 723M; 80% R800 W100');
});
