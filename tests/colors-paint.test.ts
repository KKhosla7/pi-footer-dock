import assert from 'node:assert/strict';
import { test } from 'node:test';
import { colorToRgb, oklchColor, parseColor, rgbColor } from '@earendil-works/pi-tui';
import { ICON_CONTRAST, adaptedAccent, contrast, createPaint } from '../src/ui/palette.js';
import type { PaintSettings } from '../src/ui/palette.js';
import { settingsOf, spansOf, taggingTheme } from './support/colors.js';

await test('lavender keeps its contrast with the background for every theme accent, light or dark', () => {
  for (const appearance of ['dark', 'light'] as const) {
    const background = appearance === 'dark' ? 0 : 1;
    let worst = Infinity;
    for (let step = 0; step <= 100; step += 1) {
      for (const chroma of [0, 0.1, 0.3]) {
        const accent = oklchColor(step / 100, chroma, (step * 37) % 360);
        const result = adaptedAccent(accent, appearance);
        worst = Math.min(worst, contrast(result, background));
      }
    }
    assert.ok(worst >= ICON_CONTRAST - 0.01, `${appearance}: worst contrast ${worst.toFixed(2)}`);
  }
});

await test('lavender takes the theme accent lightness and keeps our hue; palette colours and missing ones use the fixed pair', () => {
  const darkAccent = parseColor('#a798d7');
  const adapted = adaptedAccent(darkAccent, 'dark');
  const a = colorToRgb(adapted);
  const reference = colorToRgb(parseColor('#a798d7'));
  assert.ok(
    Math.abs(a.r - reference.r) < 25 && Math.abs(a.b - reference.b) < 25,
    'near the theme accent',
  );
  assert.ok(a.b > a.g && a.r > a.g, 'a lavender, not the theme hue');
  const cyanAccent = parseColor('#00b8d4');
  const fromCyan = colorToRgb(adaptedAccent(cyanAccent, 'dark'));
  assert.ok(fromCyan.b > fromCyan.g, 'a cyan theme still gives lavender');
  assert.deepEqual(colorToRgb(adaptedAccent(undefined, 'dark')), colorToRgb(parseColor('#b4a0e5')));
  assert.deepEqual(
    colorToRgb(adaptedAccent(undefined, 'light')),
    colorToRgb(parseColor('#7459b4')),
  );
  assert.deepEqual(
    colorToRgb(adaptedAccent({ kind: 'indexed', index: 4 }, 'light')),
    colorToRgb(parseColor('#7459b4')),
  );
});

await test('by default the accent is our lavender; every other tone is the theme colour it always was', () => {
  const paint = createPaint(taggingTheme());
  assert.equal(
    spansOf(paint('x', 'accent'))[0]?.code.startsWith('38;2;'),
    true,
    'a typed-in colour',
  );
  assert.equal(paint('x', 'icon'), paint('x', 'accent'));
  assert.equal(paint('x', 'text'), '<text>x</>');
  assert.equal(paint('x', 'muted'), '<dim>x</>');
  assert.equal(paint('x', 'warning'), '<warning>x</>');
  assert.equal(paint('x', 'error'), '<error>x</>');
  assert.equal(paint('x', 'success'), '<success>x</>');
  assert.equal(paint('x', 'highlight'), '<text>x</>', 'calm by default');
  assert.equal(paint('x', 'text', 'bold'), '<b><text>x</></b>');
});

await test('each choice reaches the screen: theme, the old yellow highlight, and a typed colour', () => {
  const theme = taggingTheme();
  const accent = createPaint(theme, settingsOf({ accent: 'theme' }));
  assert.equal(accent('x', 'icon'), '<accent>x</>');
  assert.equal(accent('x', 'accent', 'bold'), '<b><accent>x</></b>');
  assert.equal(
    createPaint(theme, settingsOf({ highlight: 'warning' }))('x', 'highlight'),
    '<warning>x</>',
  );
  const typed = createPaint(theme, settingsOf({ text: '#102030', error: '#ff0000' }));
  assert.equal(typed('x', 'text'), '\u001b[38;2;16;32;48mx\u001b[39m');
  assert.equal(typed('x', 'error'), '\u001b[38;2;255;0;0mx\u001b[39m');
  assert.equal(typed('x', 'warning'), '<warning>x</>', 'another tone is untouched');
});

await test('a typed colour is drawn through the theme, so it follows the terminal colour mode', () => {
  const calls: unknown[] = [];
  const theme = {
    ...taggingTheme(),
    style: (text: string, options: { fg?: unknown }) => {
      calls.push(options.fg);
      return `[${text}]`;
    },
  };
  const paint = createPaint(theme, settingsOf({ muted: '#445566' }));
  assert.equal(paint('x', 'muted'), '[x]');
  assert.deepEqual(calls, [rgbColor(0x44, 0x55, 0x66)]);
  assert.equal(createPaint(theme)('x', 'icon').startsWith('['), true, 'the adapted accent too');
});

await test('only icons go bold, and only when asked', () => {
  const theme = taggingTheme();
  const plain = createPaint(theme, settingsOf({ accent: 'theme' }, false));
  const bold = createPaint(theme, settingsOf({ accent: 'theme' }, true));
  assert.equal(plain('x', 'icon'), '<accent>x</>');
  assert.equal(bold('x', 'icon'), '<b><accent>x</></b>');
  assert.equal(bold('x', 'accent'), '<accent>x</>', 'the model name is not an icon');
  assert.equal(bold('x', 'text'), '<text>x</>');
});

await test('a theme switch or a new terminal report shows at the very next paint', () => {
  let appearance: 'dark' | 'light' = 'dark';
  let colors = { accent: oklchColor(0.72, 0.09, 295) };
  const theme = {
    fg: (color: string, text: string) => `<${color}>${text}</>`,
    bold: (text: string) => text,
    underline: (text: string) => text,
    get appearance() {
      return appearance;
    },
    get colors() {
      return colors as never;
    },
  };
  const paint = createPaint(theme);
  const before: string = paint('x', 'icon');
  assert.equal(paint('x', 'icon'), before, 'the same table gives the same colour');
  appearance = 'light';
  colors = { accent: oklchColor(0.53, 0.14, 295) };
  assert.notEqual(paint('x', 'icon'), before);
  const settings: PaintSettings = { colors: {}, iconBold: false };
  const live = createPaint(theme, () => settings);
  const first = live('x', 'text');
  settings.colors = { text: '#010203' };
  assert.notEqual(live('x', 'text'), first, 'the settings are read at every paint');
});
