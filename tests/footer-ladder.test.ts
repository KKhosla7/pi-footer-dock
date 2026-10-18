import assert from 'node:assert/strict';
import { stripVTControlCharacters } from 'node:util';
import { test } from 'node:test';
import { visibleWidth } from '@earendil-works/pi-tui';
import { defaultFooterConfig } from '../src/core/footer-config.js';
import { LOOKS } from '../src/core/looks.js';
import { portableGlyphs } from '../src/ui/glyphs.js';
import { renderSegment } from '../src/ui/segments.js';
import { demoSnapshot } from './reference.js';

const NOW = 1_800_000_000;
const config = defaultFooterConfig();
const options = { paint: (text: string) => text, glyphs: portableGlyphs, now: NOW * 1000 };
/** Reference content: every optional value present, so each look has something to give up. */
const snapshot = {
  ...demoSnapshot,
  cacheUsage: { input: 1200, read: 239_000, write: 100, prompt: 240_300, reusePercent: 99.5 },
  outputTokensPerSecond: 63.2,
  quotaStatus: null,
  rateLimits: {
    provider: 'x',
    model: 'm',
    windows: [
      { label: '5h', remainingPercent: 94, resetAt: NOW + 7140 },
      { label: 'week', remainingPercent: 48, resetAt: NOW + 282_000 },
      { label: 'month', remainingPercent: 53, resetAt: NOW + 1_641_000 },
    ],
  },
};
function widthAt(row: number, look: (typeof LOOKS)[number]): number {
  const rowConfig = config.rows[row];
  assert.ok(rowConfig);
  const side = (ids: string[]) =>
    ids
      .map((id) => renderSegment(id, snapshot, options, { config, look }))
      .filter((segment) => segment.text)
      .reduce(
        (total, segment, index) =>
          total + visibleWidth(stripVTControlCharacters(segment.text)) + (index ? segment.gap : 0),
        0,
      );
  const right = side(rowConfig.right);
  return side(rowConfig.left) + (right ? 2 + right : 0);
}

await test('each look is narrower than the one before and no step is a cliff', () => {
  for (const [row, maxStep] of [
    [0, 45],
    [1, 80],
  ] as const) {
    const widths = LOOKS.map((look) => widthAt(row, look));
    for (let index = 1; index < widths.length; index += 1) {
      const step = (widths[index - 1] ?? 0) - (widths[index] ?? 0);
      assert.ok(step >= 0, `row ${row + 1} never gets wider (${widths.join(', ')})`);
      assert.ok(step <= maxStep, `row ${row + 1} step ${step} too large (${widths.join(', ')})`);
    }
  }
});
