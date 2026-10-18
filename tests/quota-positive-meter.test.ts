import assert from 'node:assert/strict';
import { test } from 'node:test';
import { quotaMeter, renderQuota } from '../src/ui/quota.js';
import { nerdGlyphs } from '../src/ui/glyphs.js';
import { demoSnapshot } from './reference.js';
const options = { paint: (text: string) => text, glyphs: nerdGlyphs, now: 4_000_000_000_000 };

await test('positive quota never looks exhausted: seven fixed cells, monotonic fill and zero boundary', () => {
  let previous = 0;
  for (let index = 0; index <= 10_000; index += 1) {
    const percent = index / 100;
    const meter = quotaMeter(percent, options, {});
    const filled = meter.split('▰').length - 1;
    assert.equal(meter.length, 7);
    assert.match(meter, /^[▰▱]{7}$/u, 'preserve the approved slanted meter appearance');
    assert.ok(filled >= previous && filled <= 7);
    assert.ok(percent === 0 ? filled === 0 : filled >= 1);
    previous = filled;
  }
  assert.equal(quotaMeter(7, options, {}), '▰▱▱▱▱▱▱');
  assert.equal(quotaMeter(85, options, {}), '▰▰▰▰▰▰▱');
  assert.equal(quotaMeter(100, options, {}), '▰▰▰▰▰▰▰');
});
await test('seven-percent filled cell stays amber and six empty cells stay muted', () => {
  const tones: string[] = [];
  const meter = quotaMeter(
    7,
    {
      ...options,
      paint: (text, tone) => {
        tones.push(tone ?? 'text');
        return text;
      },
    },
    {},
  );
  assert.equal(meter, '▰▱▱▱▱▱▱');
  assert.deepEqual(tones, ['yellow', 'muted', 'muted', 'muted', 'muted', 'muted', 'muted']);
});
await test('rendered positive fractions do not contradict a filled meter by reporting zero percent', () => {
  for (const [percent, label] of [
    [0, '0%'],
    [0.01, '<0.1%'],
    [0.1, '0.1%'],
    [0.4, '0.4%'],
    [7, '7%'],
  ] as const) {
    const snapshot = {
      ...demoSnapshot,
      rateLimits: {
        provider: 'fixture',
        model: 'fixture',
        windows: [{ label: '5h', remainingPercent: percent, resetAt: 4_000_001_000 }],
      },
    };
    const text = renderQuota(snapshot, options, {
      icon: nerdGlyphs.hourglass,
      budget: Infinity,
      slot: {},
    });
    assert.ok(text.includes(`5h ${percent > 0 ? '▰▱▱▱▱▱▱' : '▱▱▱▱▱▱▱'} ${label}`));
  }
});
