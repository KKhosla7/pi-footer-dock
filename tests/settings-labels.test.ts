import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { menuEntries } from '../src/core/settings-groups.js';
import type { MenuEntry } from '../src/core/settings-groups.js';
import {
  colourNotes,
  fixedRowIds,
  groupText,
  itemText,
  keyFor,
  layerText,
  wordFor,
} from '../src/core/settings-labels.js';
import { menuRows } from '../src/core/settings-menu.js';
import { defaultSettings } from '../src/core/settings.js';

const published = ['5h', 'week', 'month'];
const settings = { ...defaultSettings(), glyphs: 'portable' as const };
const rows = menuRows(settings, published);
const leaves = (entries: readonly MenuEntry[]): MenuEntry[] =>
  entries.flatMap((entry) => (entry.children ? leaves(entry.children) : [entry]));

await test('every row has a label and a note, and none falls back to its id', () => {
  for (const row of rows) {
    assert.ok(row.label.length > 0 && row.label !== row.id, `${row.id} has a label`);
    assert.ok(row.description.length > 0, `${row.id} has a note`);
  }
  for (const [id, group] of Object.entries(groupText)) assert.ok(group.label && group.note, id);
});

await test('the fixed rows of the table are exactly the fixed rows the menu builds', () => {
  const fixed = rows
    .map((row) => row.id)
    .filter((id) => !/^(item|window|collapsed|layer):/u.test(id));
  assert.deepEqual([...fixed].sort(), [...fixedRowIds()].sort());
  for (const id of itemText.keys()) assert.ok(id.length > 0);
  for (const key of layerText.keys())
    assert.ok(
      rows.some((row) => row.id === `layer:${key}`),
      key,
    );
});

await test('labels are unique inside every group', () => {
  const walk = (entries: readonly MenuEntry[]): void => {
    const labels = entries.map((entry) => entry.label);
    assert.equal(new Set(labels).size, labels.length, labels.join(', '));
    for (const entry of entries) walk(entry.children ?? []);
  };
  walk(menuEntries(settings, published));
});

await test('every choice has its own word and turns back into its key', () => {
  for (const row of leaves(menuEntries(settings, published))) {
    const words = row.values.map((key) => wordFor(row.id, key));
    assert.equal(new Set(words).size, words.length, `${row.id}: words differ`);
    for (const key of row.values)
      assert.equal(keyFor(row.id, wordFor(row.id, key)), key, `${row.id}: ${key}`);
  }
});

await test('the words are the ones the user approved', () => {
  assert.deepEqual(
    ['shown', 'lg', 'md', 'sm', 'xs', 'hidden'].map((key) => wordFor('item:cache', key)),
    [
      'shown',
      'hidden when the row is a bit tight',
      'hidden when the row is tight',
      'hidden when the row is quite tight',
      'hidden when the row is very tight',
      'hidden',
    ],
  );
  assert.equal(wordFor('clicks', 'actions'), 'act');
  assert.equal(wordFor('collapsed:5h', 'shown'), 'yes');
  assert.equal(wordFor('window:5h', 'hidden'), 'hidden');
  assert.equal(keyFor('color:accent', '#ff8800'), '#ff8800', 'a typed colour is its own key');
  assert.equal(wordFor('some:extension', 'x'), 'x', 'an unknown row passes through');
});

await test('no menu logic compares or prints a word of the table: they live in the table only', () => {
  const sources = [
    'src/core/settings-menu.ts',
    'src/core/settings-groups.ts',
    'src/core/settings-collapse.ts',
    'src/core/settings-layers.ts',
    'src/core/settings-colors.ts',
    'src/ui/settings-screen.ts',
  ].map((file) => readFileSync(file, 'utf8'));
  const keys = new Set(rows.flatMap((row) => row.values));
  const words = [
    ...[...itemText.values()].flatMap((text) => [text.label, text.note]),
    ...[...layerText.values()].flatMap((text) => [text.label, text.note]),
    ...Object.values(groupText).flatMap((text) => [text.label, text.note]),
    ...Object.values(colourNotes),
    ...rows.flatMap((row) => [row.label, row.description]),
  ].filter((word) => word.length >= 6 && !keys.has(word));
  for (const word of words)
    for (const source of sources)
      assert.ok(
        !source.includes(`'${word}'`) && !source.includes(`"${word}"`),
        `"${word}" is written in code`,
      );
});
