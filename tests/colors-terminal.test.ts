import assert from 'node:assert/strict';
import { test } from 'node:test';
import { colorToRgb, rgbColor } from '@earendil-works/pi-tui';
import type { Color } from '@earendil-works/pi-tui';
import { parseColors } from '../src/core/colors.js';
import { COLOR_TONES } from '../src/core/colors.js';
import { FLOOR, contrast, createPaint, luminanceOf, readable } from '../src/ui/palette.js';
import type { Background, PaintSettings, Tone } from '../src/ui/palette.js';

type Rgb = readonly [number, number, number];
const RGBS: Record<'dark' | 'light', Record<string, Rgb>> = {
  dark: {
    text: [222, 224, 225],
    dim: [126, 136, 142],
    warning: [205, 154, 34],
    error: [226, 106, 80],
    success: [60, 190, 140],
    accent: [167, 152, 215],
  },
  light: {
    text: [59, 63, 65],
    dim: [135, 144, 149],
    warning: [143, 104, 2],
    error: [180, 60, 40],
    success: [20, 130, 90],
    accent: [116, 89, 180],
  },
};
const BLACKISH = rgbColor(0, 0, 0);
const codeOf = (color: Color): string => {
  const { r, g, b } = colorToRgb(color);
  return `\u001b[38;2;${r};${g};${b}m`;
};
function themeOf(appearance: 'dark' | 'light') {
  const colors = Object.fromEntries(
    Object.entries(RGBS[appearance]).map(([name, [r, g, b]]) => [name, rgbColor(r, g, b)]),
  );
  return {
    appearance,
    colors: colors as never,
    fg: (name: string, text: string) => `${codeOf(colors[name] ?? BLACKISH)}${text}\u001b[39m`,
    style: (text: string, options: { fg?: Color }) =>
      `${codeOf(options.fg ?? BLACKISH)}${text}\u001b[39m`,
    bold: (text: string) => text,
    underline: (text: string) => text,
  };
}
const settings =
  (colors: PaintSettings['colors'] = {}) =>
  (): PaintSettings => ({ colors, iconBold: false });
const rgbOf = (painted: string): Color => {
  const [, r, g, b] = /38;2;(\d+);(\d+);(\d+)/u.exec(painted) ?? [];
  return rgbColor(Number(r), Number(g), Number(b));
};
const BLACK: Background = { r: 0, g: 0, b: 0 };
const NIGHT: Background = { r: 30, g: 30, b: 46 };
const GREY: Background = { r: 128, g: 128, b: 128 };
const CREAM: Background = { r: 253, g: 246, b: 227 };
const WHITE: Background = { r: 255, g: 255, b: 255 };
const BACKGROUNDS: Record<string, Background> = {
  black: BLACK,
  night: NIGHT,
  grey: GREY,
  cream: CREAM,
  white: WHITE,
};
const TONES = COLOR_TONES.filter((tone) => tone !== 'accent') as Tone[];

await test('whatever the theme and the terminal, every theme colour meets its floor', () => {
  for (const appearance of ['dark', 'light'] as const) {
    for (const [name, background] of Object.entries(BACKGROUNDS)) {
      const paint = createPaint(themeOf(appearance), settings(), () => background);
      for (const tone of [...TONES, 'accent', 'icon'] as Tone[]) {
        const role = tone === 'icon' ? 'accent' : tone;
        const ratio = contrast(rgbOf(paint('x', tone)), luminanceOf(background));
        assert.ok(
          ratio >= FLOOR[role] - 0.05,
          `${appearance} theme on ${name}: ${tone} ${ratio.toFixed(2)}`,
        );
      }
    }
  }
});

await test('a theme that matches the terminal is painted exactly as the theme paints it', () => {
  for (const [appearance, background] of [
    ['dark', BLACK],
    ['light', WHITE],
  ] as const) {
    const theme = themeOf(appearance);
    const paint = createPaint(theme, settings({ accent: 'theme' }), () => background);
    const guess = createPaint(theme, settings({ accent: 'theme' }));
    const names = {
      text: 'text',
      muted: 'dim',
      warning: 'warning',
      error: 'error',
      success: 'success',
      highlight: 'text',
      accent: 'accent',
    } as const;
    for (const tone of COLOR_TONES) {
      assert.equal(paint('x', tone), theme.fg(names[tone], 'x'), `${appearance}: ${tone}`);
      assert.equal(
        guess('x', tone),
        paint('x', tone),
        `${appearance}: unknown background changes nothing`,
      );
    }
  }
});

await test('the light theme on a dark terminal is lifted until it reads, in the same hue', () => {
  const theme = themeOf('light');
  const night = NIGHT;
  const unknown = createPaint(theme, settings())('x', 'text');
  assert.equal(unknown, theme.fg('text', 'x'), 'without a report nothing changes');
  const text = rgbOf(createPaint(theme, settings(), () => night)('x', 'text'));
  assert.ok(contrast(text, luminanceOf(night)) >= 4.5);
  const { r, b } = colorToRgb(text);
  assert.ok(b >= r, 'the slightly blue grey stays blue-ish');
  assert.ok(r > 59, 'and lighter than before');
});

await test('a colour the user typed is never moved, even when it is hard to read', () => {
  const paint = createPaint(
    themeOf('light'),
    settings({ text: '#101010', accent: '#0a0a0a' }),
    () => BLACK,
  );
  assert.equal(paint('x', 'text'), '\u001b[38;2;16;16;16mx\u001b[39m');
  assert.equal(paint('x', 'icon'), '\u001b[38;2;10;10;10mx\u001b[39m');
});

await test("terminal is the terminal's own foreground, and the same faint for labels", () => {
  const paint = createPaint(
    themeOf('light'),
    settings({ text: 'terminal', muted: 'terminal' }),
    () => NIGHT,
  );
  assert.equal(paint('x', 'text'), '\u001b[39mx\u001b[39m');
  assert.equal(paint('x', 'muted'), '\u001b[2mx\u001b[22m');
  assert.deepEqual(parseColors({ text: 'terminal', muted: 'terminal' }), {
    text: 'terminal',
    muted: 'terminal',
  });
  assert.throws(() => parseColors({ error: 'terminal' }));
  assert.throws(() => parseColors({ accent: 'terminal' }));
});

await test('a new report of the background shows at the next paint, and the work is kept until then', () => {
  let background: Background | undefined = BLACK;
  let reads = 0;
  const theme = themeOf('light');
  const watched = {
    ...theme,
    get colors() {
      reads += 1;
      return theme.colors;
    },
  };
  const paint = createPaint(watched, settings(), () => background);
  const dark = paint('x', 'text');
  assert.equal(paint('x', 'text'), dark);
  background = WHITE;
  assert.equal(paint('x', 'text'), theme.fg('text', 'x'), 'a white terminal needs no change');
  assert.notEqual(paint('x', 'text'), dark);
  assert.ok(reads > 0);
});

await test('readable gives the very same colour when it reads, and black or white when nothing else can', () => {
  const white = rgbColor(255, 255, 255);
  assert.equal(readable(white, 0, 4.5), white);
  const mid = luminanceOf({ r: 120, g: 120, b: 120 });
  const grey = rgbColor(120, 120, 120);
  assert.deepEqual(
    colorToRgb(readable(grey, mid, 100)),
    { r: 0, g: 0, b: 0 },
    'an impossible floor ends at the best extreme',
  );
});
