import assert from 'node:assert/strict';
import { stripVTControlCharacters } from 'node:util';
import { test } from 'node:test';
import { visibleWidth } from '@earendil-works/pi-tui';
import { diffLine } from '../src/core/diff-lines.js';

const used: string[] = [];
const style = {
  fg: (colour: 'accent' | 'success' | 'error' | 'muted' | 'dim', text: string) => {
    used.push(colour);
    return text;
  },
};
const colourOf = (line: string): string => {
  used.length = 0;
  diffLine(line, style, 80);
  return used[0] ?? 'none';
};

await test('each kind of diff line gets its own colour', () => {
  assert.equal(colourOf('diff --git a/x b/x'), 'dim');
  assert.equal(colourOf('index 123..456 100644'), 'dim');
  assert.equal(colourOf('--- a/x'), 'dim');
  assert.equal(colourOf('+++ b/x'), 'dim');
  assert.equal(colourOf('@@ -1,3 +1,4 @@'), 'accent');
  assert.equal(colourOf('+added'), 'success');
  assert.equal(colourOf('-removed'), 'error');
  assert.equal(colourOf(' context'), 'none');
  assert.equal(colourOf('\\ No newline at end of file'), 'muted');
  assert.equal(colourOf('Binary files a/x and b/x differ'), 'muted');
});

await test('hostile file content cannot reach the terminal: escapes, controls and tabs are neutralised, width respected', () => {
  const line =
    '+\u001b[31mred\u001b]0;title\u0007\r\u0000\ttab ‮日本語日本語日本語' + 'x'.repeat(300);
  for (const width of [10, 40, 120]) {
    const shown = diffLine(line, { fg: (_c, text) => text }, width);
    assert.ok(visibleWidth(shown) <= width, `width ${width}`);
    const bad = Array.from(stripVTControlCharacters(shown), (char) => char.charCodeAt(0)).filter(
      (code) => code < 32 || code === 0x7f || code === 0x202e,
    );
    assert.deepEqual(bad, []);
    assert.equal(shown.includes(']0;'), false, 'the title-setting sequence is gone');
    assert.equal(shown.includes('31m'), false, 'the colour sequence is gone');
  }
});
