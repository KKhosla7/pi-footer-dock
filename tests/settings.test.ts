import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultFooterConfig, slotOptions } from '../src/core/footer-config.js';
import { applySettings, defaultSettings, parseSettings, withSlot } from '../src/core/settings.js';
import type { Settings } from '../src/core/settings.js';

const sample: Settings = {
  version: 1,
  glyphs: 'portable',
  quotaExpanded: true,
  clicks: 'explain',
  openWith: ['thunar', '{path}'],
  slots: {
    quota: {
      wording: 'used',
      hideWindows: ['month'],
      collapsedShow: ['5h', 'week'],
      animation: false,
    },
    cache: { hideAt: 'md' },
  },
};

await test('settings survive a save and load unchanged', () => {
  assert.deepEqual(parseSettings(JSON.parse(JSON.stringify(sample))), sample);
  assert.deepEqual(parseSettings({ version: 1 }), defaultSettings());
});

await test('anything unknown, misplaced or mistyped rejects the whole file', () => {
  const bad: unknown[] = [
    null,
    [],
    { version: 2 },
    { version: 1, extra: true },
    { version: 1, glyphs: 'emoji' },
    { version: 1, clicks: 'maybe' },
    { version: 1, openWith: 'thunar' },
    { version: 1, openWith: [] },
    { version: 1, openWith: [''] },
    { version: 1, quotaExpanded: 'yes' },
    { version: 1, slots: { nonsense: { hideAt: 'md' } } },
    { version: 1, slots: { 'quota-more': { hideAt: 'md' } } },
    { version: 1, slots: { cache: { wording: 'used' } } },
    { version: 1, slots: { cache: { text: 'custom' } } },
    { version: 1, slots: { cache: { hideAt: 'xxl' } } },
    { version: 1, slots: { quota: { hideWindows: Array.from({ length: 9 }, () => 'x') } } },
    { version: 1, slots: { quota: { hideWindows: ['bad\u001b[31m'] } } },
    { version: 1, slots: { quota: { collapsedShow: 'month' } } },
    { version: 1, slots: { quota: { collapsedShow: Array.from({ length: 9 }, () => 'x') } } },
    { version: 1, slots: { cache: { collapsedShow: ['5h'] } } },
  ];
  for (const value of bad) assert.throws(() => parseSettings(value), Error, JSON.stringify(value));
});

await test('layers: defaults, then settings, then the session wins per option', () => {
  const session = defaultFooterConfig();
  session.slots.quota = { wording: 'left' };
  const merged = applySettings(session, sample);
  assert.equal(slotOptions(merged, 'quota').wording, 'left', 'session wins');
  assert.deepEqual(slotOptions(merged, 'quota').hideWindows, ['month'], 'settings fill the rest');
  assert.equal(slotOptions(merged, 'cache').hideAt, 'md');
  assert.deepEqual(applySettings(defaultFooterConfig(), defaultSettings()), defaultFooterConfig());
});

await test('withSlot sets and clears options and drops an item left empty', () => {
  const hidden = withSlot(defaultSettings(), 'cache', { hideAt: 'sm' });
  assert.equal(hidden.slots.cache?.hideAt, 'sm');
  const cleared = withSlot(hidden, 'cache', { hideAt: undefined });
  assert.deepEqual(cleared, defaultSettings());
  assert.equal(hidden.slots.cache.hideAt, 'sm', 'the original is not changed');
});
