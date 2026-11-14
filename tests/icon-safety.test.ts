import assert from 'node:assert/strict';
import { test } from 'node:test';
import { visibleWidth } from '@earendil-works/pi-tui';
import { autoGlyphs } from '../src/core/glyph-auto.js';
import { keyFor, wordFor } from '../src/core/settings-labels.js';
import { menuRows, choose } from '../src/core/settings-menu.js';
import { defaultSettings } from '../src/core/settings.js';
import type { Settings } from '../src/core/settings.js';
import { SettingsController } from '../src/settings-controller.js';
import { nerdGlyphs, portableGlyphs } from '../src/ui/glyphs.js';

await test('the portable set is one cell wide, never an emoji, and has every icon the Nerd set has', () => {
  assert.deepEqual(Object.keys(portableGlyphs).sort(), Object.keys(nerdGlyphs).sort());
  for (const [id, glyph] of Object.entries(portableGlyphs)) {
    assert.equal(visibleWidth(glyph), 1, `${id} ${glyph} is one cell`);
    assert.doesNotMatch(glyph, /\p{Emoji_Presentation}/u, `${id} is not drawn as an emoji`);
    assert.doesNotMatch(
      glyph,
      /[\u{E000}-\u{F8FF}\u{F0000}-\u{FFFFD}]/u,
      `${id} is not a private-use glyph`,
    );
  }
  assert.deepEqual(
    [
      portableGlyphs.hourglass,
      portableGlyphs.clock,
      portableGlyphs.info,
      portableGlyphs.user,
      portableGlyphs.star,
    ],
    ['…', '○', 'i', '@', '*'],
    'the icons only extensions use are the safe ones',
  );
  assert.deepEqual(
    [
      portableGlyphs.folder,
      portableGlyphs.branch,
      portableGlyphs.changed,
      portableGlyphs.ahead,
      portableGlyphs.speed,
      portableGlyphs.reset,
    ],
    ['⌂', 'Y', '✎', '⇡', '»', '↻'],
    "the user's picks are untouched",
  );
});

await test('auto picks portable only on reliable signals, and Nerd otherwise', () => {
  const cases: [string, Record<string, string | undefined>, 'nerd' | 'portable'][] = [
    ['an empty environment', {}, 'nerd'],
    ['a UTF-8 locale', { LANG: 'en_US.UTF-8', TERM: 'xterm-256color' }, 'nerd'],
    ['UTF8 without a dash, any case', { LANG: 'de_DE.utf8' }, 'nerd'],
    ['a modifier after the encoding', { LANG: 'de_DE.UTF-8@euro' }, 'nerd'],
    ['the C locale names no encoding', { LANG: 'C' }, 'nerd'],
    ['the POSIX locale names no encoding', { LC_ALL: 'POSIX' }, 'nerd'],
    ['C.UTF-8', { LANG: 'C.UTF-8' }, 'nerd'],
    ['the Linux console', { TERM: 'linux', LANG: 'en_US.UTF-8' }, 'portable'],
    ['a dumb terminal', { TERM: 'dumb' }, 'portable'],
    ['a legacy encoding', { LANG: 'en_US.ISO-8859-1' }, 'portable'],
    ['another legacy encoding', { LC_CTYPE: 'ja_JP.eucJP' }, 'portable'],
    [
      'LC_ALL wins over LANG (UTF-8 wins)',
      { LC_ALL: 'en_US.UTF-8', LANG: 'en_US.ISO-8859-1' },
      'nerd',
    ],
    [
      'LC_ALL wins over LANG (legacy wins)',
      { LC_ALL: 'en_US.ISO-8859-1', LANG: 'en_US.UTF-8' },
      'portable',
    ],
    ['an empty LC_ALL is skipped', { LC_ALL: '', LANG: 'en_US.ISO-8859-1' }, 'portable'],
    ['other terminals', { TERM: 'xterm-kitty', LANG: 'en_US.UTF-8' }, 'nerd'],
  ];
  for (const [name, env, expected] of cases) assert.equal(autoGlyphs(env), expected, name);
});

function controller(env: Record<string, string | undefined>, saved: Settings = defaultSettings()) {
  const writes: Settings[] = [];
  const settings = new SettingsController(
    { load: () => ({ settings: saved }), save: (next) => writes.push(next) },
    env,
  );
  settings.load(() => undefined);
  return { settings, writes };
}

await test('no choice follows auto; a saved choice always wins; the session toggle starts from what is in use', () => {
  assert.equal(controller({ LANG: 'en_US.UTF-8' }).settings.glyphs, nerdGlyphs);
  assert.equal(controller({ TERM: 'linux' }).settings.glyphs, portableGlyphs);
  assert.equal(
    controller({ TERM: 'linux' }, { ...defaultSettings(), glyphs: 'nerd' }).settings.glyphs,
    nerdGlyphs,
  );
  assert.equal(
    controller({}, { ...defaultSettings(), glyphs: 'portable' }).settings.glyphs,
    portableGlyphs,
  );
  const linux = controller({ TERM: 'linux' }).settings;
  linux.toggleGlyphs();
  assert.equal(linux.glyphs, nerdGlyphs, 'a toggle on a portable terminal goes to Nerd');
  linux.followSavedGlyphs();
  assert.equal(linux.glyphs, portableGlyphs);
  assert.equal(controller({ TERM: 'linux' }).settings.iconKind, 'portable');
});

await test('the note about empty boxes is shown once, and only when auto chose Nerd icons', () => {
  const shown: string[] = [];
  const nerd = controller({ LANG: 'en_US.UTF-8' });
  nerd.settings.announceGlyphs((m) => shown.push(m));
  assert.equal(shown.length, 1);
  assert.equal(nerd.writes.at(-1)?.glyphHintShown, true);
  const portable = controller({ TERM: 'linux' });
  portable.settings.announceGlyphs((m) => shown.push(m));
  assert.equal(shown.length, 1, 'no note when the symbols every font has were chosen');
  assert.equal(portable.writes.length, 0);
  const chosen = controller({ LANG: 'en_US.UTF-8' }, { ...defaultSettings(), glyphs: 'nerd' });
  chosen.settings.announceGlyphs((m) => shown.push(m));
  assert.equal(shown.length, 1, 'no note for someone who chose');
});

await test('the Icons row starts at automatic; picking automatic removes the choice from the file', () => {
  const row = (settings: Settings) => menuRows(settings, []).find((r) => r.id === 'glyphs');
  assert.deepEqual(row(defaultSettings())?.values, ['auto', 'nerd', 'portable']);
  assert.equal(row(defaultSettings())?.current, 'auto');
  const portable = choose(defaultSettings(), 'glyphs', 'portable');
  assert.equal(portable.glyphs, 'portable');
  assert.equal(row(portable)?.current, 'portable');
  const nerd = choose(portable, 'glyphs', 'nerd');
  assert.equal(nerd.glyphs, 'nerd');
  assert.deepEqual(choose(nerd, 'glyphs', 'auto'), defaultSettings());
  assert.deepEqual(choose(defaultSettings(), 'glyphs', 'ascii'), defaultSettings());
});

await test('the Bold icons row follows the icon set in use, not only the saved choice', () => {
  const bold = (settings: Settings, icons?: 'nerd' | 'portable') =>
    menuRows(settings, [], icons).some((r) => r.id === 'iconBold');
  assert.equal(bold(defaultSettings()), false, 'automatic with nothing else known is Nerd');
  assert.equal(bold(defaultSettings(), 'portable'), true, 'automatic that chose portable symbols');
  assert.equal(bold({ ...defaultSettings(), glyphs: 'portable' }), true);
  assert.equal(bold({ ...defaultSettings(), glyphs: 'nerd' }, 'nerd'), false);
});

await test('the plain symbol set is called plain symbols on the screen and portable in the file', () => {
  assert.equal(wordFor('glyphs', 'portable'), 'plain symbols');
  assert.equal(keyFor('glyphs', 'plain symbols'), 'portable');
  assert.equal(wordFor('glyphs', 'auto'), 'automatic');
  assert.equal(wordFor('glyphs', 'nerd'), 'Nerd Font');
  const picked = choose(defaultSettings(), 'glyphs', keyFor('glyphs', 'plain symbols'));
  assert.equal(picked.glyphs, 'portable');
});
