import assert from 'node:assert/strict';
import { test } from 'node:test';
import { visibleWidth, stripTerminalSequences } from '@earendil-works/pi-tui';
import { defaultFooterConfig, parseFooterConfig } from '../src/core/footer-config.js';
import { layoutFooter } from '../src/ui/layout.js';
import { portableGlyphs } from '../src/ui/glyphs.js';
import { withCost } from './reference.js';

const options = { paint: (text: string) => text, glyphs: portableGlyphs, now: 4_000_000_000_000 };
await test('config moves/reorders/hides slots and safely renders custom templates through shared geometry', () => {
  const config = parseFooterConfig({
    rows: [
      { left: ['cost', 'speed', 'custom'], right: ['model'] },
      { left: ['context', 'output'], right: [] },
    ],
    slots: {
      custom: {
        icon: '界',
        text: '{icon} {provider}',
        help: 'Custom vendor details',
        click: 'action',
        actionTarget: 'vendor-details',
      },
      cost: { click: 'none' },
    },
  });
  for (let width = 0; width <= 220; width += 1) {
    const layout = layoutFooter({ ...withCost, outputTokensPerSecond: 20 }, width, {
      ...options,
      config,
    });
    assert.equal(layout.lines.length, 2);
    for (const line of layout.lines) assert.equal(visibleWidth(line), width);
    for (const region of layout.hitRegions) {
      assert.ok(region.x >= 0 && region.x + region.width <= width);
      assert.ok(region.y === 0 || region.y === 1);
      assert.ok(!['cost', 'workspace', 'quota'].includes(region.target));
    }
  }
  const layout = layoutFooter({ ...withCost, outputTokensPerSecond: 20 }, 220, {
    ...options,
    config,
  });
  assert.match(
    stripTerminalSequences(layout.lines[0] ?? ''),
    /^≈\$1\.23.*20\.0 tok\/s.*界 opencode-go/u,
  );
  assert.ok(layout.hitRegions.some((region) => region.target === 'custom' && region.y === 0));
});

await test('configuration rejects duplicates, controls, unbounded/unknown slots, invalid modes and extra rows', () => {
  const defaults = defaultFooterConfig();
  for (const value of [
    { rows: [...defaults.rows, defaults.rows[0]] },
    { rows: [{ left: ['cost'], right: ['cost'] }, defaults.rows[1]] },
    { rows: [{ left: ['constructor'], right: [] }, defaults.rows[1]] },
    { rows: [{ left: ['missing-custom'], right: [] }, defaults.rows[1]] },
    { slots: { speed: { click: 'shell' } } },
    { slots: { speed: { text: '\u001b[31mtext' } } },
    { slots: { speed: { gap: 20 } } },
    { slots: { speed: { command: 'execute something' } } },
    { arbitrary: true },
  ])
    assert.throws(() => parseFooterConfig(value));
  assert.deepEqual(parseFooterConfig({}), defaults);
});

await test('default regions cover each visible value without making gutter whitespace interactive', () => {
  const layout = layoutFooter({ ...withCost, outputTokensPerSecond: 20 }, 220, options);
  const ids = new Set(layout.hitRegions.map((region) => region.target));
  for (const id of [
    'context',
    'context-usage',
    'input',
    'output',
    'cache',
    'speed',
    'quota',
    'workspace',
    'model',
    'thinking',
  ])
    assert.ok(ids.has(id));
  assert.ok(ids.has('cost'));
  for (const y of [0, 1]) {
    const regions = layout.hitRegions.filter((region) => region.y === y).sort((a, b) => a.x - b.x);
    for (let index = 1; index < regions.length; index += 1) {
      const previous = regions[index - 1];
      assert.ok(previous && (regions[index]?.x ?? 0) >= previous.x + previous.width);
    }
  }
});
