import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initTheme } from '@earendil-works/pi-coding-agent';
import { defaultSettings } from '../src/core/settings.js';
import type { Settings } from '../src/core/settings.js';
import { typedColour } from '../src/ui/colour-picker.js';
import type { Background } from '../src/ui/palette.js';
import { openSettingsScreen } from '../src/ui/settings-screen.js';
import { fakeContext, flat, selectRow } from './support/settings-screen-fixtures.js';

initTheme();

function open(background: Background | undefined, start: Settings = defaultSettings()) {
  const { ctx, state } = fakeContext();
  const seen = { settings: start };
  const closed = openSettingsScreen(ctx, {
    current: () => seen.settings,
    windows: () => ['5h', 'week', 'month'],
    change: (next) => {
      seen.settings = next;
    },
    colours: { background: () => background },
  });
  const screen = state.component;
  assert.ok(screen);
  selectRow(screen, 'Appearance');
  screen.handleInput('\r');
  selectRow(screen, 'Colours');
  screen.handleInput('\r');
  const press = (...keys: string[]): void => {
    for (const key of keys) screen.handleInput(key);
  };
  const text = (): string => flat(screen.render(100));
  return { screen, seen, press, text, closed };
}
const type = (press: (...keys: string[]) => void, colour: string): void => {
  press(...colour.split(''));
};

await test('each colour row shows a swatch and a word, and Enter opens a picker of that colour', () => {
  const { text, press } = open(undefined);
  assert.match(text(), /Footer Dock settings › Appearance › Colours$/mu);
  assert.match(text(), /Accent\s+██ lavender, adapted to your theme/u);
  assert.match(text(), /Text\s+██ theme/u);
  assert.match(text(), /Highlight\s+██ theme \(calm\)/u);
  press('\r');
  assert.match(text(), /Colours › Accent$/mu, 'a breadcrumb one level deeper');
  assert.match(text(), /██ lavender, adapted to your theme\s+default/u);
  assert.match(text(), /██ theme accent/u);
  assert.match(text(), /Type a colour…/u);
  assert.equal(text().match(/^─+$/gmu)?.length, 2, 'one frame, not three');
});

await test('choosing a named colour applies it at once and the row shows the word', () => {
  const { seen, press, text } = open(undefined);
  press('\r', '\u001b[B', '\r');
  assert.deepEqual(seen.settings.colors, { accent: 'theme' });
  assert.match(text(), /Footer Dock settings › Appearance › Colours$/mu, 'back on the colour list');
  assert.match(text(), /Accent\s+██ theme accent/u);
  press('\r', '\u001b[A', '\r');
  assert.equal(seen.settings.colors, undefined, 'default clears the choice');
});

await test('Esc leaves the picker without a change, at both levels', () => {
  const { seen, press, text } = open(undefined);
  press('\r', '\u001b[B', '\u001b');
  assert.equal(seen.settings.colors, undefined);
  assert.match(text(), /Colours$/mu);
  press('\r', '\u001b[B', '\u001b[B', '\r');
  assert.match(text(), /Colour as #rrggbb:/u, 'the field is open');
  press('\u001b');
  assert.match(text(), /Type a colour…/u, 'Esc in the field goes back to the list');
  assert.equal(seen.settings.colors, undefined);
});

await test('typing a colour: a valid one is saved, an invalid one is refused with a hint, nothing is written from bad text', () => {
  const { seen, press, text } = open(undefined);
  press('\r', '\u001b[B', '\u001b[B', '\r');
  assert.match(text(), /Use # and six hex digits/u, 'help while the field holds only #');
  type(press, 'ff88');
  press('\r');
  assert.equal(seen.settings.colors, undefined, 'four digits are not a colour');
  type(press, '00');
  assert.match(text(), /██ preview/u);
  press('\r');
  assert.deepEqual(seen.settings.colors, { accent: '#ff8800' });
  assert.match(text(), /Accent\s+██ #ff8800/u, 'the row shows the colour it now has');
  press('\r');
  assert.match(text(), /██ #ff8800\s+yours/u, "the picker offers it as the user's own");
});

await test('the field says how well the colour reads on the terminal background, and saves it either way', () => {
  const known = open({ r: 0, g: 0, b: 0 });
  known.press('\r', '\u001b[B', '\u001b[B', '\r');
  type(known.press, 'ffffff');
  assert.match(known.text(), /contrast 21\.0:1 on your terminal background/u);
  assert.doesNotMatch(known.text(), /hard to read/u);
  for (let step = 0; step < 6; step += 1) known.press('\u007f');
  type(known.press, '101010');
  assert.match(known.text(), /hard to read/u);
  known.press('\r');
  assert.deepEqual(known.seen.settings.colors, { accent: '#101010' }, 'saved all the same');
  const unknown = open(undefined);
  unknown.press('\r', '\u001b[B', '\u001b[B', '\r');
  type(unknown.press, '445566');
  assert.match(unknown.text(), /contrast unknown/u);
});

await test('a text colour offers terminal, a warning colour only its default, and control characters never get in', () => {
  const { press, text, seen } = open(undefined);
  press('\u001b[B', '\r');
  assert.match(text(), /Colours › Text$/mu);
  assert.match(text(), /terminal default/u);
  press('\u001b[B', '\r');
  assert.deepEqual(seen.settings.colors, { text: 'terminal' });
  assert.equal(typedColour('#b4a0e5'), '#b4a0e5');
  assert.equal(typedColour(' b4a0e5 '), '#b4a0e5');
  for (const bad of ['', '#', 'red', '#b4a0e', '#b4a0e55', '#b4a0e5\u001b', '\u001b[31m'])
    assert.equal(typedColour(bad), undefined, JSON.stringify(bad));
});

await test('a row that depends on another appears and disappears at once, without leaving the group', () => {
  const { ctx, state } = fakeContext();
  let settings: Settings = defaultSettings();
  const closed = openSettingsScreen(ctx, {
    current: () => settings,
    windows: () => [],
    change: (next) => {
      settings = next;
    },
    icons: () => (settings.glyphs === 'portable' ? 'portable' : 'nerd'),
  });
  const screen = state.component;
  assert.ok(screen);
  selectRow(screen, 'Appearance');
  screen.handleInput('\r');
  const text = (): string => flat(screen.render(100));
  assert.doesNotMatch(text(), /Bold icons/u, 'no bold with Nerd Font icons');
  assert.match(text(), /Icons\s+automatic/u);
  screen.handleInput('\r');
  assert.match(text(), /Icons\s+Nerd Font/u);
  assert.doesNotMatch(text(), /Bold icons/u);
  screen.handleInput('\r');
  assert.match(text(), /Icons\s+plain symbols/u);
  assert.match(
    text(),
    /Bold icons\s+on/u,
    'the row appears as soon as the icons are plain symbols',
  );
  assert.match(
    text()
      .split('\n')
      .find((line) => line.trimStart().startsWith('→')) ?? '',
    /Icons/u,
    'the selection stays on the row that was changed',
  );
  screen.handleInput('\r');
  assert.match(text(), /Icons\s+automatic/u);
  assert.doesNotMatch(text(), /Bold icons/u, 'and goes away again');
  screen.handleInput('\u001b');
  screen.handleInput('\u001b');
  return closed;
});
