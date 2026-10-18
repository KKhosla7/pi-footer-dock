import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { stripVTControlCharacters } from 'node:util';
import { visibleWidth } from '@earendil-works/pi-tui';
import { parseFooterConfig } from '../src/core/footer-config.js';
import { quotaMeter, renderQuota } from '../src/ui/quota.js';
import { QuotaAnimation } from '../src/ui/quota-animation.js';
import { createPaint } from '../src/ui/palette.js';
import { nerdGlyphs } from '../src/ui/glyphs.js';
import { demoSnapshot } from './reference.js';

const options = {
  paint: createPaint({
    fg: (_tone, text) => text,
    bold: (text) => `\u001b[1m${text}\u001b[22m`,
    underline: (text) => text,
  }),
  glyphs: nerdGlyphs,
  now: 4_000_000_000_000,
};

await test('quota meters have seven fixed cells, actual rounded values and no default cost', () => {
  for (const [percent, expected] of [
    [0, 0],
    [23, 2],
    [68, 5],
    [100, 7],
  ]) {
    const meter = quotaMeter(percent ?? 0, options, {});
    assert.equal(visibleWidth(meter), 7);
    assert.equal(stripVTControlCharacters(meter).split('▰').length - 1, expected);
  }
  const text = renderQuota(demoSnapshot, options, {
    icon: nerdGlyphs.hourglass,
    budget: Infinity,
    slot: {},
  });
  assert.match(stripVTControlCharacters(text), /5h ▰▰▱▱▱▱▱ 34%.*│.*week ▰▰▰▱▱▱▱ 48%/u);
  assert.doesNotMatch(text, /\$/u);
  assert.ok(text.includes('\u001b[38;2;180;160;229m'));
});

await test('meter theme fallback and warning priority are configurable without raw terminal input', () => {
  const tones: string[] = [];
  const themed = {
    ...options,
    paint: (text: string, tone?: string) => {
      tones.push(tone ?? 'text');
      return text;
    },
  };
  quotaMeter(68, themed, { meterColor: 'theme' });
  assert.ok(tones.includes('cyan'));
  tones.length = 0;
  quotaMeter(23, themed, {});
  assert.ok(tones.includes('yellow'));
  assert.ok(!tones.includes('lavender'));
  assert.equal(
    parseFooterConfig({ slots: { quota: { meterColor: 'theme', animation: false } } }).slots.quota
      ?.animation,
    false,
  );
  assert.throws(() => parseFooterConfig({ slots: { quota: { meterColor: '\u001b[31m' } } }));
  assert.throws(() => parseFooterConfig({ slots: { quota: { animation: 'true' } } }));
});

await test('real-value updates trigger a finite highlight, never initial load or unchanged refreshes', async () => {
  let renders = 0;
  const animation = new QuotaAnimation(() => {
    renders += 1;
  });
  const changed = {
    ...demoSnapshot,
    rateLimits: demoSnapshot.rateLimits
      ? {
          ...demoSnapshot.rateLimits,
          windows: demoSnapshot.rateLimits.windows.map((window) => ({
            ...window,
            remainingPercent: 68,
          })),
        }
      : null,
  };
  try {
    animation.update(demoSnapshot, true);
    assert.equal(animation.frame, -1);
    animation.update(demoSnapshot, true);
    assert.equal(animation.frame, -1);
    animation.update(changed, true);
    assert.equal(animation.frame, 0);
    const original = renderQuota(changed, options, {
      icon: nerdGlyphs.hourglass,
      budget: Infinity,
      slot: {},
    });
    const animated = renderQuota(
      changed,
      { ...options, quotaFrame: 0 },
      { icon: nerdGlyphs.hourglass, budget: Infinity, slot: {} },
    );
    assert.equal(stripVTControlCharacters(original), stripVTControlCharacters(animated));
    assert.equal(visibleWidth(original), visibleWidth(animated));
    await delay(600);
    assert.equal(animation.frame, -1);
    assert.equal(renders, 7);
    animation.update(changed, true);
    assert.equal(animation.frame, -1);
    animation.update(demoSnapshot, false);
    assert.equal(animation.frame, -1);
  } finally {
    animation.stop();
  }
});

await test('model switch, stale state and disposal cancel update animation', async () => {
  const limits = demoSnapshot.rateLimits;
  assert.ok(limits);
  const changed = {
    ...demoSnapshot,
    rateLimits: {
      ...limits,
      windows: limits.windows.map((window) => ({
        ...window,
        remainingPercent: window.remainingPercent === 68 ? 67 : 68,
      })),
    },
  };
  for (const mode of ['model', 'stale', 'dispose']) {
    let renders = 0;
    const animation = new QuotaAnimation(() => {
      renders += 1;
    });
    animation.update(demoSnapshot, true);
    animation.update(changed, true);
    assert.equal(
      animation.frame,
      0,
      'a real animation interval must be active before cancellation',
    );
    if (mode === 'model') animation.update({ ...changed, model: 'other' }, true);
    else if (mode === 'stale') animation.update({ ...changed, quotaStatus: 'quota stale' }, true);
    else animation.stop();
    assert.equal(animation.frame, -1);
    await delay(100);
    assert.equal(renders, 0);
    animation.stop();
  }
});
