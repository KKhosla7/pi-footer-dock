import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stripVTControlCharacters } from 'node:util';
import { defaultFooterConfig } from '../src/core/footer-config.js';
import { nerdGlyphs, portableGlyphs } from '../src/ui/glyphs.js';
import { createPaint } from '../src/ui/palette.js';
import { renderSegment } from '../src/ui/segments.js';
import { demoSnapshot } from './reference.js';

await test('every stock footer icon shares the robot accent in both glyph sets and live themes', () => {
  let accent = '36';
  const paint = createPaint({
    fg: (color, text) =>
      `\u001b[${color === 'accent' ? accent : color === 'warning' ? '33' : '90'}m${text}\u001b[39m`,
    bold: (text) => text,
    underline: (text) => text,
  });
  const config = defaultFooterConfig();
  const snapshot = { ...demoSnapshot, outputTokensPerSecond: 12.3 };
  for (const color of ['36', '35']) {
    accent = color;
    for (const glyphs of [nerdGlyphs, portableGlyphs]) {
      const options = { paint, glyphs, now: 4_000_000_000_000 };
      const cases = [
        ['workspace', glyphs.folder],
        ['branch', glyphs.branch],
        ['changes', glyphs.changed],
        ['ahead', glyphs.ahead],
        ['model', glyphs.robot],
        ['thinking', glyphs.reasoning],
        ['context', glyphs.chip],
        ['input', glyphs.input],
        ['output', glyphs.output],
        ['cache', glyphs.cache],
        ['speed', glyphs.speed],
      ] as const;
      for (const [id, icon] of cases) {
        const segment = renderSegment(id, snapshot, options, { config, look: 'xl' });
        const separator = id === 'changes' || id === 'ahead' ? '  ' : ' ';
        assert.ok(
          segment.text.includes(`\u001b[${accent}m${icon}${separator}\u001b[39m`),
          `${id} must share the robot accent`,
        );
      }
      const quota = renderSegment('quota', snapshot, options, { config, look: 'xl' });
      assert.ok(quota.text.includes(`\u001b[${accent}m${glyphs.reset}\u001b[39m`));
      assert.ok(!stripVTControlCharacters(quota.text).includes('⌛'));
      const changed = renderSegment('changes', snapshot, options, { config, look: 'xl' });
      assert.ok(
        changed.text.includes('\u001b[33m2\u001b[39m'),
        'changed-file value retains warning color',
      );
      const thinking = renderSegment('thinking', snapshot, options, { config, look: 'xl' });
      assert.ok(thinking.text.includes('\u001b[90mhigh\u001b[39m'), 'thinking label stays muted');
      assert.equal(stripVTControlCharacters(thinking.text), `${glyphs.reasoning} high`);
    }
  }
});

await test('overridden and templated icons use the same accent without changing text or spacing', () => {
  const paint = createPaint({
    fg: (color, text) => `\u001b[${color === 'accent' ? '36' : '90'}m${text}\u001b[39m`,
    bold: (text) => text,
    underline: (text) => text,
  });
  const config = defaultFooterConfig();
  config.slots.thinking = { icon: '★' };
  config.slots.custom = { icon: '☆', text: '{icon} {provider}: {thinking} {icon}' };
  const options = { paint, glyphs: nerdGlyphs };
  const stock = renderSegment('thinking', demoSnapshot, options, { config, look: 'xl' });
  assert.ok(stock.text.includes('\u001b[36m★ \u001b[39m'));
  const custom = renderSegment('custom', demoSnapshot, options, { config, look: 'xl' });
  assert.equal(custom.text.split('\u001b[36m☆\u001b[39m').length, 3);
  assert.equal(stripVTControlCharacters(custom.text), `☆ ${demoSnapshot.provider}: high ☆`);
});

await test('branch name uses normal value text while its icon retains the shared accent', () => {
  const codes: Record<string, string> = { accent: '36', text: '37', dim: '90' };
  const paint = createPaint({
    fg: (color, text) => `\u001b[${codes[color] ?? '90'}m${text}\u001b[39m`,
    bold: (text) => text,
    underline: (text) => text,
  });
  const options = { paint, glyphs: nerdGlyphs };
  const settings = { config: defaultFooterConfig(), look: 'xl' as const };
  const branch = renderSegment('branch', demoSnapshot, options, settings);
  assert.equal(branch.text, `\u001b[36m${nerdGlyphs.branch} \u001b[39m\u001b[37mmain\u001b[39m`);
  const input = renderSegment('input', demoSnapshot, options, settings);
  assert.ok(input.text.includes('\u001b[37m77.0M\u001b[39m'));
});
