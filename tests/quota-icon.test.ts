import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultFooterConfig } from '../src/core/footer-config.js';
import { renderSegment } from '../src/ui/segments.js';
import { nerdGlyphs, portableGlyphs } from '../src/ui/glyphs.js';
import { quotaHelp } from '../src/core/quota-freshness.js';
import { demoSnapshot } from './reference.js';
const options = { paint: (text: string) => text, glyphs: nerdGlyphs, now: 4_000_000_000_000 };
await test('default quota starts with its actual window, without an hourglass in either glyph set', () => {
  for (const glyphs of [nerdGlyphs, portableGlyphs]) {
    const rendered = renderSegment(
      'quota',
      demoSnapshot,
      { ...options, glyphs },
      {
        config: defaultFooterConfig(),
        look: 'xl',
      },
    ).text;
    assert.ok(rendered.startsWith('5h '));
    assert.doesNotMatch(rendered, /[\uf251\uf252\uf253⧖⌛⏳]/u);
    assert.match(rendered, /5h [▰▱]{7} 34%.*week [▰▱]{7} 48%.*month [▰▱]{7} 18%/u);
  }
});
await test('explicit quota icons and custom text remain supported and fixed', () => {
  for (const icon of ['★', nerdGlyphs.hourglass, portableGlyphs.hourglass]) {
    const config = defaultFooterConfig();
    config.slots.quota = { icon };
    assert.ok(
      renderSegment('quota', demoSnapshot, options, { config, look: 'xl' }).text.startsWith(
        `${icon}  `,
      ),
    );
    config.slots.quota = { icon, text: '{icon} custom quota' };
    assert.equal(
      renderSegment('quota', demoSnapshot, options, { config, look: 'xl' }).text,
      `${icon} custom quota`,
    );
  }
});
await test('stale quota remains visible and exact observation age stays in help', () => {
  const snapshot = {
    ...demoSnapshot,
    provider: 'openai-codex',
    quotaStatus: 'quota stale',
    quotaFreshness: {
      ageMs: 44_000,
      receivedMono: performance.now(),
      observedAt: options.now - 44_000,
    },
  };
  const text = renderSegment('quota', snapshot, options, {
    config: defaultFooterConfig(),
    look: 'xl',
  }).text;
  assert.match(text, /\(stale\)/u);
  assert.doesNotMatch(text, /old/u);
  assert.match(quotaHelp(snapshot, 'Codex'), /44s old/u);
  assert.match(quotaHelp(snapshot, 'Codex'), /Codex reports these windows itself/u);
});
