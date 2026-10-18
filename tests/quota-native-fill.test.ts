import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stripVTControlCharacters } from 'node:util';
import { sliceByColumn, visibleWidth } from '@earendil-works/pi-tui';
import { quotaMeter } from '../src/ui/quota.js';
import { nerdGlyphs } from '../src/ui/glyphs.js';

await test('native column slicing cannot spatially subdivide an original slanted glyph', () => {
  for (const glyph of ['▰', '▱']) {
    const styled = `\u001b[38;2;180;160;229m${glyph}\u001b[39m`;
    assert.equal(visibleWidth(styled), 1);
    for (let step = 0; step <= 100; step += 1) {
      const width = step / 100;
      for (const strict of [true, false]) {
        const result = stripVTControlCharacters(sliceByColumn(styled, 0, width, strict));
        assert.ok(result === '' || result === glyph, 'a slice contains a whole glyph or none');
      }
    }
  }
});

await test('original text meter has discrete cells, not the requested fractional interiors', () => {
  const options = {
    paint: (text: string) => `\u001b[38;2;180;160;229m${text}\u001b[39m`,
    glyphs: nerdGlyphs,
  };
  for (const [percent, wholeCells, boundaryHundredths] of [
    [7, 1, 49],
    [50, 4, 50],
    [85, 6, 95],
  ] as const) {
    const text = stripVTControlCharacters(quotaMeter(percent, options, {}));
    assert.match(text, /^[▰▱]{7}$/u);
    assert.equal(visibleWidth(text), 7);
    assert.equal(text.split('▰').length - 1, wholeCells);
    const idealHundredths = 7 * percent;
    assert.equal(idealHundredths % 100, boundaryHundredths);
    assert.notEqual(wholeCells * 100, idealHundredths, 'do not claim coarse cells are exact fill');
  }
});
