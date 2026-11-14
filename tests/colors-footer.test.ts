import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stripVTControlCharacters } from 'node:util';
import { visibleWidth } from '@earendil-works/pi-tui';
import { COLOR_TONES } from '../src/core/colors.js';
import { defaultFooterConfig } from '../src/core/footer-config.js';
import { nerdGlyphs, portableGlyphs } from '../src/ui/glyphs.js';
import { layoutFooter } from '../src/ui/layout.js';
import { createPaint } from '../src/ui/palette.js';
import type { PaintSettings, Tone } from '../src/ui/palette.js';
import { renderSegment } from '../src/ui/segments.js';
import { demoSnapshot } from './reference.js';
import { NOW, ansiTheme, spansOf, taggingTheme } from './support/colors.js';

type Layout = ReturnType<typeof layoutFooter>;
function sameShape(layout: Layout, reference: Layout, width: number): void {
  assert.deepEqual(
    layout.lines.map((line) => stripVTControlCharacters(line)),
    reference.lines.map((line) => stripVTControlCharacters(line)),
  );
  assert.deepEqual(layout.hitRegions, reference.hitRegions);
  for (const line of layout.lines) assert.equal(visibleWidth(line), width, `${width} columns`);
}

await test('colours and bold never change a character of the footer or a click area', () => {
  const config = defaultFooterConfig();
  const plain: PaintSettings = { colors: {}, iconBold: false };
  const choices: PaintSettings[] = [
    plain,
    { colors: {}, iconBold: true },
    { colors: { accent: 'theme', highlight: 'warning' }, iconBold: false },
    {
      colors: Object.fromEntries(COLOR_TONES.map((tone) => [tone, '#123456'])),
      iconBold: true,
    },
  ];
  const widths = [60, 100, 140, 220];
  for (const glyphs of [nerdGlyphs, portableGlyphs]) {
    for (const width of widths) {
      const draw = (settings: PaintSettings) =>
        layoutFooter(demoSnapshot, width, {
          paint: createPaint(ansiTheme(), () => settings),
          glyphs,
          now: NOW,
          config,
        });
      const reference = draw(plain);
      for (const layout of choices.map(draw)) sameShape(layout, reference, width);
    }
  }
});

await test('changing one tone changes only that tone; the others are byte for byte the same', () => {
  const draw = (settings: PaintSettings) =>
    layoutFooter({ ...demoSnapshot, outputTokensPerSecond: 12 }, 220, {
      paint: createPaint(ansiTheme(), () => settings),
      glyphs: nerdGlyphs,
      now: NOW,
      config: defaultFooterConfig(),
    }).lines;
  const baseSettings: PaintSettings = { colors: { accent: 'theme' }, iconBold: false };
  const base = draw(baseSettings);
  const TYPED = '38;2;10;11;12';
  const theme = createPaint(ansiTheme(), () => baseSettings);
  for (const tone of ['text', 'muted', 'highlight', 'warning', 'error', 'success'] as const) {
    const changed = draw({
      colors: { ...baseSettings.colors, [tone]: '#0a0b0c' },
      iconBold: false,
    });
    const code = spansOf(theme('x', tone))[0]?.code;
    base.forEach((line, row) => {
      const before = spansOf(line);
      const after = spansOf(changed[row] ?? '');
      assert.deepEqual(
        after.map((span) => span.text),
        before.map((span) => span.text),
        `${tone}: same characters`,
      );
      before.forEach((span, index) => {
        const now = after[index]?.code;
        if (now !== span.code) {
          assert.equal(now, TYPED, `${tone}: only the typed colour appears`);
          assert.equal(span.code, code, `${tone}: only text of that tone changed`);
        }
      });
    });
  }
});

await test('icons, the model name and the meter fill are one colour; warnings and highlights are not', () => {
  const colourOf = (tone: Tone, text: string): string => createPaint(taggingTheme())(text, tone);
  assert.equal(colourOf('icon', 'a'), colourOf('accent', 'a'));
  const config = defaultFooterConfig();
  const tones: string[] = [];
  const recording = {
    paint: (text: string, tone?: Tone) => {
      tones.push(`${tone ?? 'text'}:${text}`);
      return text;
    },
    glyphs: nerdGlyphs,
    now: NOW,
  };
  renderSegment('context-usage', demoSnapshot, recording, { config, look: 'xl' });
  renderSegment('changes', demoSnapshot, recording, { config, look: 'xl' });
  renderSegment('compaction', demoSnapshot, recording, { config, look: 'xl' });
  const used = (prefix: string) => tones.filter((entry) => entry.startsWith(prefix));
  assert.ok(used('highlight:').length >= 4, 'context bar, percent, changes, compaction');
  assert.ok(!used('warning:').length, 'a healthy footer shows no warning colour');
  renderSegment(
    'quota',
    {
      ...demoSnapshot,
      rateLimits: {
        provider: 'p',
        model: 'm',
        windows: [{ label: '5h', remainingPercent: 80, resetAt: 4_000_008_100 }],
      },
    },
    recording,
    { config, look: 'xl' },
  );
  assert.ok(used('accent:▰').length > 0, 'the meter fill is the accent');
  assert.ok(!used('warning:').length, 'a healthy limit shows no warning colour');
});

await test('a limit at 25% or less is a warning and a blocked one an error, never a highlight', () => {
  const tones = new Map<string, Tone>();
  const recording = {
    paint: (text: string, tone?: Tone) => {
      tones.set(text, tone ?? 'text');
      return text;
    },
    glyphs: nerdGlyphs,
    now: NOW,
  };
  const low = {
    ...demoSnapshot,
    rateLimits: {
      provider: 'p',
      model: 'm',
      windows: [
        { label: '5h', remainingPercent: 20, resetAt: 4_000_008_100 },
        { label: 'week', remainingPercent: 60, resetAt: 4_000_295_200 },
        { label: 'month', remainingPercent: 0, resetAt: 4_001_209_600, badge: 'paused' },
      ],
    },
  };
  renderSegment('quota', low, recording, { config: defaultFooterConfig(), look: 'xl' });
  assert.equal(tones.get('20%'), 'warning');
  assert.equal(tones.get('60%'), 'text');
  assert.equal(tones.get('0%'), 'error');
});
