import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findEntry, menuEntries } from '../src/core/settings-groups.js';
import type { MenuEntry } from '../src/core/settings-groups.js';
import { menuRows } from '../src/core/settings-menu.js';
import { choose } from '../src/core/settings-menu.js';
import { defaultSettings } from '../src/core/settings.js';
import type { Settings } from '../src/core/settings.js';

const published = ['5h', 'week', 'month'];
/** The windows that stay when collapsed, sorted. */
function stays(settings: Settings): string[] {
  const quota = settings.slots.quota;
  assert.ok(quota);
  return [...(quota.collapsedShow ?? [])].sort();
}
/** Every row at any depth, groups excluded. */
const leaves = (entries: readonly MenuEntry[]): MenuEntry[] =>
  entries.flatMap((entry) => (entry.children ? leaves(entry.children) : [entry]));

await test('every menu row sits in exactly one place, so nothing is lost or duplicated', () => {
  const entries = menuEntries(defaultSettings(), published);
  const placed = leaves(entries).map((row) => row.id);
  const all = menuRows(defaultSettings(), published).map((row) => row.id);
  assert.deepEqual([...placed].sort(), [...all].sort());
  assert.equal(new Set(placed).size, placed.length);
});

await test('related rows are clubbed and the icon set stays on the top level', () => {
  const entries = menuEntries(defaultSettings(), published);
  assert.deepEqual(
    entries.map((entry) => entry.label),
    [
      'Project and Git',
      'Model',
      'Context and tokens',
      'Cache, speed and cost',
      'Limit usage',
      'Item clicks',
      'Icons',
    ],
  );
  const limits = entries.find((entry) => entry.id === 'group:quota');
  assert.deepEqual(
    limits?.children?.map((row) => row.id),
    [
      'item:quota',
      'window:5h',
      'window:week',
      'window:month',
      'limits',
      'wording',
      'group:collapse',
      'expanded',
      'animation',
      'meter',
    ],
  );
  assert.equal(entries.at(-1)?.children, undefined);
});

await test('a group says whether anything in it differs from the defaults', () => {
  const summaryOf = (settings = defaultSettings()) =>
    menuEntries(settings, published).map((entry) => entry.current);
  assert.ok(
    summaryOf()
      .slice(0, 5)
      .every((text) => text === 'all default'),
  );
  let settings = choose(defaultSettings(), 'item:cache', 'hidden');
  settings = choose(settings, 'item:speed', 'hidden from sm');
  settings = choose(settings, 'window:month', 'hidden');
  const summaries = summaryOf(settings);
  assert.equal(summaries[3], '2 changed');
  assert.equal(summaries[4], '1 changed');
  assert.equal(summaries[0], 'all default');
});

await test('every row, in a group or not, says what it does, so none shows or hides text as you move', () => {
  const entries = menuEntries(defaultSettings(), published);
  const everyRow = (list: readonly MenuEntry[]): MenuEntry[] =>
    list.flatMap((entry) => [entry, ...everyRow(entry.children ?? [])]);
  for (const row of everyRow(entries))
    assert.ok(row.description.length > 0, `${row.id} has a description`);
});

await test('"Limit windows" is a group of its own: the mode, then a row per window for what stays', () => {
  const entries = menuEntries(defaultSettings(), published);
  const windows = findEntry(entries, 'group:collapse');
  assert.ok(windows);
  assert.equal(windows.label, 'Limit windows');
  assert.equal(windows.current, 'when tight', 'its value is the mode');
  assert.deepEqual(
    windows.children?.map((row) => [row.id, row.current]),
    [
      ['collapse', 'when tight'],
      ['collapsed:5h', 'shown'],
      ['collapsed:week', 'shown'],
      ['collapsed:month', 'hidden'],
    ],
    'by default every window stays except the last',
  );
  const always = choose(defaultSettings(), 'collapse', 'always collapsed');
  assert.equal(
    menuEntries(always, published)
      .find((entry) => entry.id === 'group:quota')
      ?.children?.find((entry) => entry.id === 'group:collapse')?.current,
    'always collapsed',
  );
});

await test('choosing which windows stay is saved, and the default does not count as a change', () => {
  const none = menuEntries(defaultSettings(), published).find(
    (entry) => entry.id === 'group:quota',
  );
  assert.equal(none?.current, 'all default');
  const picked = choose(defaultSettings(), 'collapsed:month', 'shown', published);
  assert.deepEqual(stays(picked), ['5h', 'month', 'week']);
  const narrowed = choose(picked, 'collapsed:week', 'hidden', published);
  assert.deepEqual(stays(narrowed), ['5h', 'month']);
  assert.equal(
    menuEntries(narrowed, published).find((entry) => entry.id === 'group:quota')?.current,
    '2 changed',
    'week and month both differ from the default',
  );
  const none9 = Array.from({ length: 9 }, (_, index) => `w${index}`);
  let crowded = defaultSettings();
  for (const label of none9.slice(0, 8))
    crowded = choose(crowded, `collapsed:${label}`, 'shown', none9);
  assert.equal(choose(crowded, 'collapsed:w8', 'shown', none9), crowded, 'at most eight are kept');
  assert.equal(
    choose(defaultSettings(), `collapsed:${'x'.repeat(25)}`, 'shown', published).slots.quota,
    undefined,
  );
});

await test('windows hidden for good are not offered when collapsing, and "last" ignores them', () => {
  const hidden = choose(defaultSettings(), 'window:month', 'hidden');
  const rows = leaves(menuEntries(hidden, published)).filter((row) =>
    row.id.startsWith('collapsed:'),
  );
  assert.deepEqual(
    rows.map((row) => [row.id, row.current]),
    [
      ['collapsed:5h', 'shown'],
      ['collapsed:week', 'hidden'],
    ],
    'week is now the last visible window',
  );
});
