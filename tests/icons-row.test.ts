import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initTheme } from '@earendil-works/pi-coding-agent';
import { keyFor, wordFor } from '../src/core/settings-labels.js';
import { defaultSettings } from '../src/core/settings.js';
import type { Settings } from '../src/core/settings.js';
import { openSettingsScreen } from '../src/ui/settings-screen.js';
import { fakeContext, flat, selectRow } from './support/settings-screen-fixtures.js';

initTheme();

await test('automatic names the set it picked, and every word still turns back into its key', () => {
  assert.equal(wordFor('glyphs', 'auto', 'nerd'), 'automatic (Nerd Font)');
  assert.equal(wordFor('glyphs', 'auto', 'portable'), 'automatic (plain symbols)');
  assert.equal(wordFor('glyphs', 'auto'), 'automatic');
  assert.equal(wordFor('glyphs', 'nerd', 'portable'), 'Nerd Font');
  assert.equal(wordFor('glyphs', 'portable', 'nerd'), 'plain symbols');
  for (const word of ['automatic', 'automatic (Nerd Font)', 'automatic (plain symbols)'])
    assert.equal(keyFor('glyphs', word), 'auto', word);
  assert.equal(keyFor('glyphs', 'Nerd Font'), 'nerd');
  assert.equal(keyFor('glyphs', 'plain symbols'), 'portable');
  assert.equal(wordFor('clicks', 'actions', 'nerd'), 'act', 'other rows are untouched');
});

function iconsRow(kind: 'nerd' | 'portable') {
  const { ctx, state } = fakeContext();
  const seen: { settings: Settings } = { settings: defaultSettings() };
  const closed = openSettingsScreen(ctx, {
    current: () => seen.settings,
    windows: () => [],
    change: (next) => {
      seen.settings = next;
    },
    icons: () => seen.settings.glyphs ?? kind,
  });
  const screen = state.component;
  assert.ok(screen);
  selectRow(screen, 'Appearance');
  screen.handleInput('\r');
  const row = (): string =>
    flat(screen.render(100))
      .split('\n')
      .find((line) => line.includes('Icons')) ?? '';
  return { screen, seen, row, closed };
}

await test('the Icons row says which set automatic is using, and the cycle still works', async () => {
  const nerd = iconsRow('nerd');
  assert.match(nerd.row(), /Icons\s+automatic \(Nerd Font\)/u);
  nerd.screen.handleInput('\r');
  assert.match(nerd.row(), /Icons\s+Nerd Font/u);
  assert.equal(nerd.seen.settings.glyphs, 'nerd');
  nerd.screen.handleInput('\r');
  assert.match(nerd.row(), /Icons\s+plain symbols/u);
  assert.equal(nerd.seen.settings.glyphs, 'portable');
  nerd.screen.handleInput('\r');
  assert.equal(nerd.seen.settings.glyphs, undefined, 'automatic removes the choice');
  assert.match(nerd.row(), /Icons\s+automatic \(Nerd Font\)/u);
  nerd.screen.handleInput('\u001b');
  nerd.screen.handleInput('\u001b');
  await nerd.closed;
  const plain = iconsRow('portable');
  assert.match(plain.row(), /Icons\s+automatic \(plain symbols\)/u);
  plain.screen.handleInput('\u001b');
  plain.screen.handleInput('\u001b');
  await plain.closed;
});
