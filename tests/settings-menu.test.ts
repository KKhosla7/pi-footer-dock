import assert from 'node:assert/strict';
import { test } from 'node:test';
import { choose, menuRows } from '../src/core/settings-menu.js';
import { defaultSettings, parseSettings, settingsItems } from '../src/core/settings.js';
import type { Settings } from '../src/core/settings.js';

const row = (settings: Settings, id: string, windows: string[] = []) =>
  menuRows(settings, windows).find((candidate) => candidate.id === id);

await test('every item has a visibility row, the chevron does not, and defaults read as shown', () => {
  const rows = menuRows(defaultSettings(), []);
  for (const id of settingsItems())
    assert.equal(row(defaultSettings(), `item:${id}`)?.current, 'shown');
  assert.ok(!rows.some((candidate) => candidate.id === 'item:quota-more'));
  assert.equal(row(defaultSettings(), 'wording')?.current, 'left');
  assert.equal(row(defaultSettings(), 'glyphs')?.current, 'auto', 'no choice reads as automatic');
});

await test('visibility cycles shown, hidden from a look, hidden, and maps to hideAt', () => {
  const values = row(defaultSettings(), 'item:cache')?.values;
  assert.deepEqual(values, ['shown', 'lg', 'md', 'sm', 'xs', 'hidden']);
  const narrow = choose(defaultSettings(), 'item:cache', 'md');
  assert.equal(narrow.slots.cache?.hideAt, 'md');
  assert.equal(row(narrow, 'item:cache')?.current, 'md');
  const never = choose(narrow, 'item:cache', 'hidden');
  assert.equal(never.slots.cache?.hideAt, 'xl');
  assert.equal(row(never, 'item:cache')?.current, 'hidden');
  assert.deepEqual(choose(never, 'item:cache', 'shown'), defaultSettings());
});

await test('hiding one item or one quota window touches nothing else', () => {
  const hidden = choose(defaultSettings(), 'item:input', 'hidden');
  assert.deepEqual(Object.keys(hidden.slots), ['input']);
  const published = ['5h', 'week', 'month'];
  const month = choose(defaultSettings(), 'window:month', 'hidden');
  assert.deepEqual(month.slots.quota?.hideWindows, ['month']);
  assert.equal(row(month, 'window:month', published)?.current, 'hidden');
  assert.equal(row(month, 'window:week', published)?.current, 'shown');
  assert.deepEqual(choose(month, 'window:month', 'shown'), defaultSettings());
});

await test('a hidden window stays listed even when the provider no longer publishes it', () => {
  const month = choose(defaultSettings(), 'window:month', 'hidden');
  assert.ok(row(month, 'window:month', []));
});

await test('quota options and the global ones round-trip through the file format', () => {
  let settings = defaultSettings();
  for (const [id, value] of [
    ['wording', 'used'],
    ['collapse', 'always'],
    ['animation', 'off'],
    ['color:accent', 'theme'],
    ['color:text', 'default'],
    ['iconBold', 'off'],
    ['expanded', 'yes'],
    ['glyphs', 'portable'],
    ['clicks', 'explain'],
    ['window:month', 'hidden'],
    ['item:cache', 'sm'],
  ] as const)
    settings = choose(settings, id, value);
  assert.deepEqual(parseSettings(JSON.parse(JSON.stringify(settings))), settings);
  const quota = settings.slots.quota;
  assert.ok(quota);
  assert.equal(quota.wording, 'used');
  assert.equal(quota.collapse, 'always');
  assert.equal(quota.animation, false);
  assert.equal(settings.colors?.accent, 'theme');
  assert.equal(settings.iconBold, false);
  assert.equal(settings.quotaExpanded, true);
  assert.equal(settings.glyphs, 'portable');
  assert.equal(settings.clicks, 'explain');
  assert.equal(choose(settings, 'clicks', 'actions').clicks, 'actions');
});

await test('unknown rows, values and unsavable labels change nothing', () => {
  const base = defaultSettings();
  assert.equal(choose(base, 'item:nonsense', 'hidden'), base);
  assert.equal(choose(base, 'item:quota-more', 'hidden'), base);
  assert.equal(choose(base, 'item:cache', 'sideways'), base);
  assert.equal(choose(base, 'wording', 'both'), base);
  assert.equal(choose(base, 'window:' + 'x'.repeat(25), 'hidden'), base);
  assert.equal(choose(base, 'nonsense', 'x'), base);
});

await test('more than eight hidden windows are refused rather than saved unloadably', () => {
  let settings = defaultSettings();
  for (let index = 0; index < 8; index += 1)
    settings = choose(settings, `window:w${index}`, 'hidden');
  assert.equal(settings.slots.quota?.hideWindows?.length, 8);
  assert.equal(choose(settings, 'window:w8', 'hidden'), settings);
});

await test('the compaction unit defaults to tokens, picks percent, and round-trips the file format', () => {
  assert.equal(row(defaultSettings(), 'unit')?.current, 'tokens');
  const percent = choose(defaultSettings(), 'unit', 'percent');
  assert.equal(percent.slots.compaction?.unit, 'percent');
  assert.equal(row(percent, 'unit')?.current, 'percent');
  assert.deepEqual(parseSettings(JSON.parse(JSON.stringify(percent))), percent);
  assert.deepEqual(choose(percent, 'unit', 'tokens'), defaultSettings());
  assert.equal(choose(defaultSettings(), 'unit', 'bits').slots.compaction, undefined);
  assert.throws(() => parseSettings({ version: 1, slots: { cache: { unit: 'percent' } } }));
  assert.throws(() => parseSettings({ version: 1, slots: { compaction: { unit: 'bytes' } } }));
  assert.throws(() => parseSettings({ version: 1, slots: { compaction: { wording: 'used' } } }));
});
