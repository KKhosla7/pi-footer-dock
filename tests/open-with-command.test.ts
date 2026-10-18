import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { defaultOpener } from '../src/core/open-folder.js';
import { defaultSettings } from '../src/core/settings.js';
import type { Settings } from '../src/core/settings.js';
import { runOpenWith } from '../src/open-with-command.js';
import { SettingsController } from '../src/settings-controller.js';

function harness() {
  const saved: Settings[] = [];
  const controller = new SettingsController({
    load: () => ({ settings: defaultSettings() }),
    save: (settings) => saved.push(settings),
  });
  const said: string[] = [];
  const ctx = {
    ui: { notify: (message: string) => said.push(message) },
  } as unknown as ExtensionContext;
  return { controller, saved, said, ctx };
}

await test('no arguments says what opens the folder now, without changing anything', () => {
  const { controller, saved, said, ctx } = harness();
  runOpenWith('', ctx, controller);
  assert.match(said[0] ?? '', new RegExp(defaultOpener(process.platform), 'u'));
  assert.deepEqual(saved, []);
});

await test('a command is validated, saved and read back; "default" clears it', () => {
  const { controller, saved, said, ctx } = harness();
  runOpenWith('thunar {path}', ctx, controller);
  assert.deepEqual(controller.current.openWith, ['thunar', '{path}']);
  assert.equal(saved.length, 1);
  runOpenWith('', ctx, controller);
  assert.match(said.at(-1) ?? '', /thunar \{path\}/u);
  runOpenWith('default', ctx, controller);
  assert.equal(controller.current.openWith, undefined);
  assert.equal(saved.length, 2);
});

await test('an invalid command changes nothing and says why', () => {
  const { controller, saved, said, ctx } = harness();
  runOpenWith('a b c d e f g h i', ctx, controller);
  assert.equal(controller.current.openWith, undefined);
  assert.deepEqual(saved, []);
  assert.match(said.at(-1) ?? '', /^Not changed:/u);
});
