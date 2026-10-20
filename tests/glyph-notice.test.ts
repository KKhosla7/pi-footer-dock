import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultSettings, parseSettings } from '../src/core/settings.js';
import { SettingsController } from '../src/settings-controller.js';
import type { Settings } from '../src/core/settings.js';
import type { SettingsStore } from '../src/settings-controller.js';

/** A store that keeps the "file" in memory and counts what happens to it. */
function memoryStore(initial: Settings = defaultSettings(), problem?: string) {
  const state = { file: initial, saves: 0, fail: false };
  const store: SettingsStore = {
    load: () => ({ settings: state.file, ...(problem ? { problem } : {}) }),
    save: (settings) => {
      if (state.fail) throw new Error('read-only');
      state.saves += 1;
      state.file = parseSettings(JSON.parse(JSON.stringify(settings)));
    },
  };
  return { state, store };
}

function start(store: SettingsStore): { controller: SettingsController; said: string[] } {
  const controller = new SettingsController(store);
  const said: string[] = [];
  controller.load(() => undefined);
  controller.announceGlyphs((message) => said.push(message));
  return { controller, said };
}

await test('a user who never chose an icon set is told once, and never again', () => {
  const { state, store } = memoryStore();
  const first = start(store);
  assert.equal(first.said.length, 1);
  assert.match(first.said[0] ?? '', /\/dock-glyphs/);
  assert.match(first.said[0] ?? '', /Nerd Font/);
  assert.equal(state.file.glyphHintShown, true, 'saved');

  first.controller.announceGlyphs((message) => first.said.push(message));
  assert.equal(first.said.length, 1, 'not twice in one session (for example after /dock-glyphs)');

  const next = start(store);
  assert.deepEqual(next.said, [], 'not in a later session');
  assert.equal(state.saves, 1, 'one write in total');
});

await test('the icon set stays what it was: Nerd by default, and the note changes nothing else', () => {
  const { state, store } = memoryStore();
  const { controller } = start(store);
  assert.equal(controller.current.glyphs, undefined, 'no choice is made for the user');
  assert.equal(state.file.glyphs, undefined);
  assert.deepEqual(state.file.slots, {});
});

await test('a user who chose an icon set is not told, and nothing is written', () => {
  for (const glyphs of ['nerd', 'portable'] as const) {
    const { state, store } = memoryStore({ ...defaultSettings(), glyphs });
    const { said } = start(store);
    assert.deepEqual(said, [], glyphs);
    assert.equal(state.saves, 0, glyphs);
  }
});

await test('a settings file that was ignored is never overwritten', () => {
  const { state, store } = memoryStore(defaultSettings(), 'not valid JSON');
  const { said } = start(store);
  assert.deepEqual(said, []);
  assert.equal(state.saves, 0);
});

await test('a failing save does not throw; the note may come again next time', () => {
  const { state, store } = memoryStore();
  state.fail = true;
  const first = start(store);
  assert.equal(first.said.length, 1);
  state.fail = false;
  assert.equal(start(store).said.length, 1);
});

await test('the flag round-trips and only a boolean is accepted', () => {
  const settings = { ...defaultSettings(), glyphHintShown: true };
  assert.deepEqual(parseSettings(JSON.parse(JSON.stringify(settings))), settings);
  assert.throws(() => parseSettings({ version: 1, glyphHintShown: 'yes' }), /boolean/);
  assert.equal('glyphHintShown' in defaultSettings(), false, 'not part of the defaults');
});
