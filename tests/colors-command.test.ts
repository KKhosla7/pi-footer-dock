import assert from 'node:assert/strict';
import { test } from 'node:test';
import { visibleWidth } from '@earendil-works/pi-tui';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { runColor } from '../src/color-command.js';
import { defaultSettings } from '../src/core/settings.js';
import type { Settings } from '../src/core/settings.js';
import { SettingsController } from '../src/settings-controller.js';
import { nerdGlyphs, portableGlyphs } from '../src/ui/glyphs.js';

function commandHarness() {
  const saved: Settings[] = [];
  const controller = new SettingsController({
    load: () => ({ settings: defaultSettings() }),
    save: (settings) => saved.push(settings),
  });
  const said: string[] = [];
  const ctx = {
    ui: { notify: (message: string) => said.push(message) },
  } as unknown as ExtensionContext;
  let redraws = 0;
  let known: number | undefined;
  const run = (args: string): void => {
    runColor(args, ctx, controller, {
      redraw: () => {
        redraws += 1;
      },
      contrastOf: () => known,
      describeBackground: () => 'terminal background: test',
    });
  };
  const knowContrast = (ratio: number | undefined): void => {
    known = ratio;
  };
  return { controller, saved, said, run, knowContrast, redraws: () => redraws };
}

await test('/dock-color shows, sets, resets, and refuses without saving anything half-done', () => {
  const { controller, saved, said, run, redraws } = commandHarness();
  run('');
  assert.match(said[0] ?? '', /accent: default/u);
  assert.match(said[0] ?? '', /terminal background: test/u);
  assert.equal(saved.length, 0);
  run('accent #AA55cc');
  assert.deepEqual(controller.current.colors, { accent: '#AA55cc' });
  assert.equal(saved.length, 1);
  assert.equal(redraws(), 1);
  run('text default');
  assert.equal(saved.length, 2, 'a harmless save');
  for (const bad of [
    'accent red',
    'accent #12',
    'accent #12345\u001b',
    'sparkle #112233',
    'accent',
    'accent #112233 extra',
    'bold maybe',
    'text lavender',
  ]) {
    const before: number = saved.length;
    run(bad);
    assert.equal(saved.length, before, `"${bad}" saves nothing`);
    assert.deepEqual(controller.current.colors, { accent: '#AA55cc' }, `"${bad}" changes nothing`);
  }
  assert.equal(controller.paintSettings({ slots: {} }).iconBold, false, 'Nerd icons paint no bold');
  controller.toggleGlyphs();
  assert.equal(
    controller.paintSettings({ slots: {} }).iconBold,
    true,
    'bold is on for the plain set',
  );
  run('bold off');
  assert.equal(controller.current.iconBold, false);
  assert.equal(controller.paintSettings({ slots: {} }).iconBold, false, 'and off when asked');
  controller.followSavedGlyphs();
  run('bold on');
  assert.equal(controller.current.iconBold, undefined, 'on is the default, stored as nothing');
  assert.match(said.at(-1) ?? '', /Nerd Font/u, 'with Nerd icons it says bold will not show');
  run('reset');
  assert.equal(controller.current.colors, undefined);
  assert.match(said.at(-1) ?? '', /defaults/u);
  assert.equal(
    controller.paintSettings({ slots: {} }),
    controller.paintSettings({ slots: {} }),
    'the paint settings are the same object until the settings change',
  );
  assert.equal(
    controller.paintSettings({ slots: { quota: { meterColor: 'theme' } } }).colors.accent,
    'theme',
    'a session /dock-config meterColor still reaches the icons and the meter',
  );
  assert.equal(controller.paintSettings({ slots: {} }).colors.accent, undefined);
});

await test('the plain icon set is ordinary one-cell Unicode, without the emoji-wide speed symbol', () => {
  for (const [name, glyph] of Object.entries(portableGlyphs)) {
    assert.equal(visibleWidth(glyph), 1, `${name} ${glyph} is one cell`);
  }
  assert.equal(portableGlyphs.speed, '»');
  assert.equal(portableGlyphs.reset, '↻');
  assert.deepEqual(Object.keys(portableGlyphs).sort(), Object.keys(nerdGlyphs).sort());
});

await test('/dock-color warns when a typed colour would be hard to read, and still saves it', () => {
  const { controller, said, run, knowContrast } = commandHarness();
  run('text #101010');
  assert.equal(said.length, 1, 'no warning while the terminal background is unknown');
  knowContrast(1.4);
  run('text #111111');
  assert.match(said.at(-1) ?? '', /hard to read.*1\.4:1/u);
  assert.deepEqual(controller.current.colors, { text: '#111111' });
  knowContrast(9);
  run('text #eeeeee');
  assert.doesNotMatch(said.at(-1) ?? '', /hard to read/u);
  knowContrast(1.4);
  run('text default');
  assert.doesNotMatch(said.at(-1) ?? '', /hard to read/u, 'only a typed colour is judged');
});
