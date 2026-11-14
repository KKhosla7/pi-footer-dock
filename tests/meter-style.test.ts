import assert from 'node:assert/strict';
import { test } from 'node:test';
import { visibleWidth } from '@earendil-works/pi-tui';
import { parseFooterConfig } from '../src/core/footer-config.js';
import { METER_CELLS, METER_STYLES, meterSample } from '../src/core/meter-styles.js';
import { menuRows, choose } from '../src/core/settings-menu.js';
import { keyFor, wordFor } from '../src/core/settings-labels.js';
import { defaultSettings, parseSettings } from '../src/core/settings.js';
import { nerdGlyphs } from '../src/ui/glyphs.js';
import { quotaMeter } from '../src/ui/quota.js';
import type { Tone } from '../src/ui/palette.js';

const plain = { paint: (text: string) => text, glyphs: nerdGlyphs };

await test('every style draws seven one-cell characters, and at least one filled cell for any positive value', () => {
  for (const style of METER_STYLES) {
    const { on, off } = METER_CELLS[style];
    assert.equal(visibleWidth(on), 1, `${style} on`);
    assert.equal(visibleWidth(off), 1, `${style} off`);
    assert.doesNotMatch(on + off, /\p{Emoji_Presentation}/u, `${style} is not an emoji`);
    for (const percent of [0, 0.4, 7, 14, 50, 76, 99, 100]) {
      const meter = quotaMeter(percent, plain, style);
      assert.equal(Array.from(meter).length, 7, `${style} ${percent}%`);
      const filled = Array.from(meter).filter((cell) => cell === on).length;
      assert.equal(filled > 0, percent > 0, `${style} ${percent}% fills ${filled}`);
      assert.equal(Array.from(meter).filter((cell) => cell !== on && cell !== off).length, 0);
    }
  }
});

await test('the same percent fills the same number of cells in every style, and the default is the slanted look', () => {
  const counts = METER_STYLES.map((style) => {
    const { on } = METER_CELLS[style];
    return [76, 50, 18].map(
      (p) => Array.from(quotaMeter(p, plain, style)).filter((c) => c === on).length,
    );
  });
  for (const row of counts) assert.deepEqual(row, counts[0]);
  assert.equal(quotaMeter(76, plain), '▰▰▰▰▰▱▱');
  assert.equal(quotaMeter(76, plain, 'line'), '━━━━━──');
  assert.equal(quotaMeter(50, plain, 'blocks'), '████░░░');
});

await test('colours and the animated cell follow the cell, not the character', () => {
  for (const style of METER_STYLES) {
    const seen: [string, Tone | undefined, string | undefined][] = [];
    quotaMeter(
      40,
      {
        ...plain,
        quotaFrame: 1,
        paint: (text: string, tone?: Tone, emphasis?: 'bold' | 'underline') => {
          seen.push([text, tone, emphasis]);
          return text;
        },
      },
      style,
    );
    assert.deepEqual(
      seen.map(([, tone]) => tone),
      ['accent', 'accent', 'accent', 'muted', 'muted', 'muted', 'muted'],
      style,
    );
    assert.deepEqual(
      seen.map(([, , emphasis]) => emphasis),
      [undefined, 'bold', undefined, undefined, undefined, undefined, undefined],
      `${style}: only the animated cell is bold`,
    );
  }
  assert.equal(
    quotaMeter(
      20,
      { ...plain, paint: (t: string, tone?: Tone) => `${tone}:${t}` },
      'line',
    ).startsWith('warning:'),
    true,
  );
});

await test('the option is read and written, refuses anything else, and is quota only', () => {
  for (const style of METER_STYLES) {
    const settings = parseSettings({ version: 1, slots: { quota: { meterStyle: style } } });
    assert.equal(settings.slots.quota?.meterStyle, style);
    assert.equal(
      parseFooterConfig({ slots: { quota: { meterStyle: style } } }).slots.quota?.meterStyle,
      style,
    );
  }
  for (const bad of ['dots', 'ascii', '', 7, null, '#', '\u001b[31m', ['line']]) {
    assert.throws(
      () => parseSettings({ version: 1, slots: { quota: { meterStyle: bad } } }),
      /./u,
      String(bad),
    );
  }
  assert.throws(
    () => parseSettings({ version: 1, slots: { cache: { meterStyle: 'line' } } }),
    /not available/u,
  );
});

await test('the settings row shows a sample of each style, and choosing one stores it (slanted stores nothing)', () => {
  const row = (settings = defaultSettings()) =>
    menuRows(settings, []).find((r) => r.id === 'meterStyle');
  assert.deepEqual(row()?.values, [...METER_STYLES]);
  assert.equal(row()?.current, 'slanted');
  assert.equal(wordFor('meterStyle', 'slanted'), `slanted ${meterSample('slanted')}`);
  assert.equal(wordFor('meterStyle', 'line'), 'line ━━━──');
  assert.equal(wordFor('meterStyle', 'blocks'), 'solid blocks ███░░');
  for (const style of METER_STYLES)
    assert.equal(keyFor('meterStyle', wordFor('meterStyle', style)), style);
  const line = choose(defaultSettings(), 'meterStyle', 'line');
  assert.equal(line.slots.quota?.meterStyle, 'line');
  assert.equal(row(line)?.current, 'line');
  assert.deepEqual(parseSettings(JSON.parse(JSON.stringify(line))), line);
  assert.deepEqual(choose(line, 'meterStyle', 'slanted'), defaultSettings());
  assert.deepEqual(choose(defaultSettings(), 'meterStyle', 'dots'), defaultSettings());
});
