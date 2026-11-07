import assert from 'node:assert/strict';
import { stripVTControlCharacters } from 'node:util';
import { test } from 'node:test';
import { visibleWidth } from '@earendil-works/pi-tui';
import { defaultFooterConfig, parseFooterConfig } from '../src/core/footer-config.js';
import type { FooterConfig } from '../src/core/footer-config.js';
import { explainConfig } from '../src/core/config-command.js';
import { checkConfig, checkSettings } from '../src/core/settings-problems.js';
import { parseSettings } from '../src/core/settings.js';
import { portableGlyphs } from '../src/ui/glyphs.js';
import { layoutFooter } from '../src/ui/layout.js';
import { demoSnapshot } from './reference.js';

/** Item layers: the model's layers and the layers setting. */
const NOW = 4_000_000_000_000;
const configWith = (layers: Record<string, boolean>): FooterConfig => ({
  ...defaultFooterConfig(),
  slots: { model: { layers } },
});
const firstRow = (width: number, config: FooterConfig): string => {
  const layout = layoutFooter(demoSnapshot, width, {
    paint: (text) => text,
    glyphs: portableGlyphs,
    now: NOW,
    config,
  });
  return stripVTControlCharacters(layout.lines[0] ?? '');
};
const model = (width: number, layers: Record<string, boolean>): string =>
  (/▣ \S+/u.exec(firstRow(width, configWith(layers))) ?? [''])[0];

await test('with no layers setting the footer is exactly what it was', () => {
  for (const width of [40, 90, 120, 160, 240]) {
    assert.equal(
      firstRow(width, configWith({})),
      firstRow(width, defaultFooterConfig()),
      `${width}`,
    );
    assert.equal(
      firstRow(width, configWith({ provider: true, name: true })),
      firstRow(width, defaultFooterConfig()),
    );
  }
});

await test('the provider off prints the name alone; the name off prints the provider alone; never a stray slash', () => {
  const full = firstRow(240, defaultFooterConfig());
  assert.match(full, /▣ opencode-go\/deepseek-v4\.1-flash/u);
  const noProvider = firstRow(240, configWith({ provider: false }));
  assert.match(noProvider, /▣ deepseek-v4\.1-flash/u);
  assert.doesNotMatch(noProvider, /opencode-go/u);
  const noName = firstRow(240, configWith({ name: false }));
  assert.match(noName, /▣ opencode-go(?! ?\/|\S)/u);
  assert.doesNotMatch(noName, /deepseek/u);
  assert.doesNotMatch(noName, /opencode-go\//u);
});

await test('a layer that is off is never printed, at any width; one that is on is printed where it was', () => {
  const plain = defaultFooterConfig();
  for (let width = 1; width <= 2000; width += width < 300 ? 1 : 111) {
    const base = firstRow(width, plain);
    const noProvider = firstRow(width, configWith({ provider: false }));
    const noName = firstRow(width, configWith({ name: false }));
    assert.doesNotMatch(noProvider, /opencode-go/u, `${width}`);
    assert.doesNotMatch(noName, /deepseek/u, `${width}`);
    if (base.includes('deepseek')) assert.match(noProvider, /deepseek/u, `${width}`);
    for (const row of [noProvider, noName]) assert.ok(visibleWidth(row) <= width, `fits ${width}`);
  }
});

await test('the provider shows at every look the item shows when the name is off', () => {
  const widths = [60, 80, 100, 120, 140, 160];
  const shown = widths.map((width) =>
    firstRow(width, configWith({ name: false })).includes('opencode-go'),
  );
  assert.ok(shown.some(Boolean));
  const withName = widths.map((width) =>
    firstRow(width, defaultFooterConfig()).includes('deepseek'),
  );
  for (const [index, width] of widths.entries())
    if (withName[index]) assert.ok(shown[index], `the item was dropped at ${width}`);
});

await test('with both layers off the model item is absent and leaves no gap behind', () => {
  const off = configWith({ provider: false, name: false });
  for (const width of [80, 140, 200, 300]) {
    const layout = layoutFooter(demoSnapshot, width, {
      paint: (text) => text,
      glyphs: portableGlyphs,
      now: NOW,
      config: off,
    });
    assert.ok(!layout.hitRegions.some((region) => region.target === 'model'), `${width}`);
    assert.doesNotMatch(stripVTControlCharacters(layout.lines[0] ?? ''), /▣ /u);
  }
  assert.equal(model(240, { provider: false, name: false }), '');
});

await test('layers are accepted under the model and the quota, in the file and in /dock-config', () => {
  const ok = {
    version: 1,
    slots: {
      model: { layers: { provider: false } },
      quota: { layers: { meter: false, reset: true } },
    },
  };
  assert.deepEqual(checkSettings(ok, 'f'), []);
  assert.equal(parseSettings(ok).slots.model?.layers?.provider, false);
  assert.deepEqual(checkConfig({ slots: { model: { layers: { name: false } } } }, 'c'), []);
  assert.equal(
    parseFooterConfig({ slots: { quota: { layers: { reset: false } } } }).slots.quota?.layers
      ?.reset,
    false,
  );
});

await test('every wrong layers setting is one problem with a path, a reason and a fix', () => {
  const wrong: [unknown, RegExp, string][] = [
    [{ model: { layers: { provder: false } } }, /Did you mean provider/u, 'slots.model.layers'],
    [{ model: { layers: { provider: 'no' } } }, /true or false/u, 'slots.model.layers'],
    [{ model: { layers: ['provider'] } }, /JSON object|not accepted/u, 'slots.model.layers'],
    [{ cost: { layers: { meter: false } } }, /not available for cost/u, 'slots.cost.layers'],
    [{ quota: { layers: { provider: false } } }, /Use meter or reset/u, 'slots.quota.layers'],
    [
      {
        model: {
          layers: Object.fromEntries(Array.from({ length: 9 }, (_, i) => [`l${i}`, false])),
        },
      },
      /At most 8/u,
      'slots.model.layers',
    ],
  ];
  for (const [slots, reason, setting] of wrong) {
    const found = checkSettings({ version: 1, slots }, 'f');
    assert.equal(found.length, 1, JSON.stringify(slots));
    const [only] = found;
    assert.ok(only);
    assert.equal(only.setting, setting);
    assert.match(`${only.reason} ${only.fix}`, reason);
    assert.throws(() => parseSettings({ version: 1, slots }));
  }
  assert.match(
    explainConfig('{"slots":{"model":{"layers":{"provder":false}}}}'),
    /Did you mean provider/u,
  );
  assert.match(
    explainConfig('{"slots":{"workspace":{"layers":{"x":false}}}}'),
    /not available for workspace/u,
  );
});
