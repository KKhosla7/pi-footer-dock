import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSettings } from '../src/core/settings-problems.js';
import { defaultSettings, parseSettings } from '../src/core/settings.js';
import { menuEntries } from '../src/core/settings-groups.js';
import { choose, menuRows } from '../src/core/settings-menu.js';

/** Item layers: the settings screen rows. */
const menu = (settings = defaultSettings()) => menuRows(settings, []);
const layerIds = (): string[] =>
  menu()
    .map((item) => item.id)
    .filter((id) => id.startsWith('layer:'));

await test('the screen offers exactly the parts the table declares, each shown by default', () => {
  assert.deepEqual(layerIds(), [
    'layer:model:provider',
    'layer:model:name',
    'layer:quota:meter',
    'layer:quota:reset',
  ]);
  for (const item of menu().filter((entry) => entry.id.startsWith('layer:'))) {
    assert.equal(item.current, 'shown');
    assert.deepEqual(item.values, ['shown', 'hidden']);
    assert.ok(item.label.length > 0 && item.description.length > 0, item.id);
  }
});

await test('every write round-trips through the parser, and switching a part back on leaves the file as it was', () => {
  for (const id of layerIds()) {
    const hidden = choose(defaultSettings(), id, 'hidden');
    assert.deepEqual(checkSettings(JSON.parse(JSON.stringify(hidden)), 'f'), [], id);
    assert.deepEqual(parseSettings(JSON.parse(JSON.stringify(hidden))), hidden, id);
    assert.equal(menu(hidden).find((item) => item.id === id)?.current, 'hidden');
    assert.deepEqual(choose(hidden, id, 'shown'), defaultSettings(), id);
    assert.deepEqual(choose(hidden, id, 'hidden'), hidden, 'the same value changes nothing');
  }
  const both = choose(
    choose(defaultSettings(), 'layer:model:provider', 'hidden'),
    'layer:model:name',
    'hidden',
  );
  assert.deepEqual(both.slots.model?.layers, { provider: false, name: false });
  assert.deepEqual(checkSettings(JSON.parse(JSON.stringify(both)), 'f'), []);
});

await test('an unknown or misplaced layer row, or a wrong value, changes nothing', () => {
  const start = defaultSettings();
  for (const id of [
    'layer:cost:meter',
    'layer:model:meter',
    'layer:model',
    'layer:model:name:x',
    'layer::',
  ])
    assert.equal(choose(start, id, 'hidden'), start, id);
  assert.equal(choose(start, 'layer:model:name', 'maybe'), start);
});

await test('the parts sit with their item: the model ones under Model, the quota ones under Limit usage', () => {
  const entries = menuEntries(defaultSettings(), []);
  const children = (id: string) =>
    (entries.find((entry) => entry.id === id)?.children ?? []).map((entry) => entry.id);
  assert.ok(children('group:model').includes('layer:model:provider'));
  assert.ok(children('group:model').includes('layer:model:name'));
  assert.ok(children('group:quota').includes('layer:quota:meter'));
  assert.ok(children('group:quota').includes('layer:quota:reset'));
  const hidden = menuEntries(choose(defaultSettings(), 'layer:model:name', 'hidden'), []);
  assert.match(hidden.find((entry) => entry.id === 'group:model')?.current ?? '', /1 changed/u);
});
