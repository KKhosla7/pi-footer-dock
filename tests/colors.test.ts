import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COLOR_TONES, effectiveColors, parseColors, withColor } from '../src/core/colors.js';
import { choose, menuRows } from '../src/core/settings-menu.js';
import { defaultSettings, parseSettings } from '../src/core/settings.js';
import type { Settings } from '../src/core/settings.js';

await test('a colour is #rrggbb or a named choice of its tone; anything else is refused', () => {
  assert.deepEqual(parseColors({ accent: '#b4a0e5', text: 'theme', highlight: 'warning' }), {
    accent: '#b4a0e5',
    text: 'theme',
    highlight: 'warning',
  });
  const refused: unknown[] = [
    '#12345',
    '#12345g',
    '#1234567',
    '#abc',
    'red',
    'rgb(1,2,3)',
    '#12345\u001b',
    '\u001b[31m',
    '',
    7,
    null,
    {},
    ['#112233'],
  ];
  for (const value of refused) {
    for (const tone of COLOR_TONES)
      assert.throws(() => parseColors({ [tone]: value }), /./u, `${tone}: ${String(value)}`);
  }
  assert.throws(() => parseColors({ sparkle: '#112233' }), /Unknown colour/u);
  assert.throws(() => parseColors({ text: 'lavender' }), 'lavender is the accent only');
  assert.throws(() => parseColors({ accent: 'warning' }), 'warning is a highlight choice only');
  assert.throws(() => parseColors('#112233'));
});

await test('the settings file reads colours and bold icons, and refuses bad ones', () => {
  const settings = parseSettings({
    version: 1,
    colors: { accent: '#102030' },
    iconBold: false,
    slots: {},
  });
  assert.deepEqual(settings.colors, { accent: '#102030' });
  assert.equal(settings.iconBold, false);
  assert.deepEqual(parseSettings(JSON.parse(JSON.stringify(settings))), settings);
  assert.throws(() => parseSettings({ version: 1, colors: { accent: 'blue' }, slots: {} }));
  assert.throws(() => parseSettings({ version: 1, iconBold: 'yes', slots: {} }));
  assert.throws(() => parseSettings({ version: 1, colours: {}, slots: {} }), /Unknown setting/u);
});

await test('setting a colour stores only what differs from the default; the old meterColor is the accent', () => {
  assert.deepEqual(withColor({}, 'accent', '#112233'), { accent: '#112233' });
  assert.deepEqual(withColor({ accent: '#112233' }, 'accent', 'default'), {});
  assert.deepEqual(withColor({ accent: '#112233' }, 'accent', 'lavender'), {});
  assert.deepEqual(withColor({}, 'text', 'theme'), {});
  assert.deepEqual(withColor({}, 'highlight', 'warning'), { highlight: 'warning' });
  assert.throws(() => withColor({}, 'text', 'red'));
  const legacy: Settings = { ...defaultSettings(), slots: { quota: { meterColor: 'theme' } } };
  assert.deepEqual(effectiveColors(legacy, 'theme'), { accent: 'theme' });
  assert.deepEqual(
    effectiveColors({ ...legacy, colors: { accent: '#112233' } }, 'theme'),
    { accent: '#112233' },
    'colors.accent wins over the old setting',
  );
  assert.deepEqual(effectiveColors(defaultSettings()), {});
  assert.deepEqual(effectiveColors(defaultSettings(), 'lavender'), {});
});

await test('the colour rows offer the default, the named choices and the colour the user has', () => {
  const rows = (settings: Settings) => new Map(menuRows(settings, []).map((row) => [row.id, row]));
  const start = rows(defaultSettings());
  assert.deepEqual(start.get('color:accent')?.values, ['default', 'theme']);
  assert.deepEqual(start.get('color:highlight')?.values, ['default', 'warning']);
  assert.deepEqual(start.get('color:text')?.values, ['default', 'terminal']);
  assert.deepEqual(start.get('color:muted')?.values, ['default', 'terminal']);
  assert.deepEqual(start.get('color:error')?.values, ['default']);
  assert.equal(
    start.get('iconBold'),
    undefined,
    'Nerd icons cannot be bold, so the row is not shown',
  );
  const plain = rows({ ...defaultSettings(), glyphs: 'portable' }).get('iconBold');
  assert.equal(plain?.current, 'on', 'bold is on by default for the plain icons');
  assert.equal(
    rows({ ...defaultSettings(), glyphs: 'portable', iconBold: false }).get('iconBold')?.current,
    'off',
  );
  let settings = choose(defaultSettings(), 'color:accent', 'theme');
  assert.deepEqual(settings.colors, { accent: 'theme' });
  settings = { ...settings, colors: { accent: '#112233' } };
  const custom = rows(settings).get('color:accent');
  assert.deepEqual(custom?.values, ['default', 'theme', '#112233']);
  assert.equal(custom.current, '#112233');
  assert.equal(choose(settings, 'color:accent', 'default').colors, undefined);
  assert.deepEqual(
    choose(settings, 'color:accent', '#445566').colors,
    { accent: '#445566' },
    'a colour typed in the screen is accepted',
  );
  for (const bad of ['#44556', '#44556g', 'red', '#445566\u001b', 'terminal'])
    assert.equal(choose(settings, 'color:accent', bad), settings, `${bad} changes nothing`);
  assert.equal(
    choose(settings, 'color:text', 'warning'),
    settings,
    'a named choice it does not offer',
  );
  assert.deepEqual(choose(defaultSettings(), 'color:text', 'terminal').colors, {
    text: 'terminal',
  });
  assert.equal(choose(defaultSettings(), 'iconBold', 'off').iconBold, false);
  const off = choose(defaultSettings(), 'iconBold', 'off');
  assert.equal(
    choose(off, 'iconBold', 'on').iconBold,
    undefined,
    'on is the default, stored as nothing',
  );
});

await test('an old meterColor of theme shows as the accent row, and resetting it really resets', () => {
  const legacy: Settings = { ...defaultSettings(), slots: { quota: { meterColor: 'theme' } } };
  const row = menuRows(legacy, []).find((item) => item.id === 'color:accent');
  assert.equal(row?.current, 'theme');
  const reset = choose(legacy, 'color:accent', 'default');
  assert.deepEqual(effectiveColors(reset, reset.slots.quota?.meterColor), { accent: 'lavender' });
});
