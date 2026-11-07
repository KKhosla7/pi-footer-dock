import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stripVTControlCharacters } from 'node:util';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { renderBlocks } from '../src/core/explain/render.js';
import { problemBlocks, problemsHeader } from '../src/core/problems-view.js';
import { problem } from '../src/core/problems.js';
import type { Problem } from '../src/core/problems.js';
import { defaultSettings } from '../src/core/settings.js';
import type { SettingsLoad } from '../src/adapters/settings-file.js';
import { ProblemsController } from '../src/problems-controller.js';
import { SettingsController } from '../src/settings-controller.js';
import { plainStyle } from '../src/ui/explain-style.js';
import { harness } from './support/interactions-harness.js';

/** The problems screen, the click, re-reading the file. */
const problems = [
  problem(
    '~/.pi/agent/pi-footer-dock.json',
    'limits',
    'The value "maybe" is not accepted.',
    'Use on or off.',
  ),
  problem(
    '~/.pi/agent/pi-footer-dock.json',
    'shrink',
    'Unknown shrink step: drop:cots',
    'Did you mean drop:cost?',
  ),
];

await test('the problems screen lists every problem with where, setting, what is wrong and the fix', () => {
  const text = stripVTControlCharacters(
    renderBlocks([...problemsHeader(problems), ...problemBlocks(problems)], plainStyle, 100).join(
      '\n',
    ),
  );
  for (const expected of [
    'Problem 1 of 2',
    'Problem 2 of 2',
    'Where',
    'Setting',
    'What is wrong',
    'Fix',
    'pi-footer-dock.json',
    'limits',
    'Use on or off.',
    'Did you mean drop:cost?',
    'press r',
  ])
    assert.ok(text.includes(expected), `${expected} is missing from:\n${text}`);
  const none = stripVTControlCharacters(
    renderBlocks(problemsHeader([]), plainStyle, 100).join('\n'),
  );
  assert.match(none, /no configuration problems/u);
});

await test('a click on the marker opens the problems screen, and no other target does', async () => {
  const { interactions, ctx } = harness();
  const opened: unknown[] = [];
  const host = (
    interactions as unknown as { display: { problems: { open: (c: unknown) => Promise<void> } } }
  ).display;
  host.problems.open = (c) => {
    opened.push(c);
    return Promise.resolve();
  };
  await interactions.activate('problems', ctx);
  assert.equal(opened.length, 1);
  await interactions.activate('workspace:icon', ctx).catch(() => undefined);
  assert.equal(opened.length, 1);
});

const controllerOver = (loads: SettingsLoad[]) => {
  const settings = new SettingsController({
    load: () => loads.shift() ?? { settings: defaultSettings() },
    save: () => undefined,
  });
  const applied: unknown[] = [];
  const controller = new ProblemsController({
    settings,
    tui: () => undefined,
    interactions: () => ({
      settingsChanged: (before) => {
        applied.push(before);
      },
    }),
  });
  return { settings, controller, applied };
};
const notices: string[] = [];
const quiet = {
  ui: { notify: (message: string) => notices.push(message) },
  mode: 'tui',
} as unknown as ExtensionContext;

await test('the controller follows the settings that were loaded, however they were loaded', () => {
  const broken: Problem[] = [...problems];
  const { settings, controller } = controllerOver([
    { settings: defaultSettings(), problem: 'x', problems: broken },
    { settings: defaultSettings() },
  ]);
  assert.equal(controller.state.count, 0, 'nothing loaded yet');
  settings.load(() => undefined);
  assert.equal(controller.state.count, 2);
  assert.equal(controller.state.alerting, true);
  settings.load(() => undefined);
  assert.equal(controller.state.count, 0, 'a clean read clears them');
});

await test('reading the fixed file again applies it, clears the marker and says so; a file still broken stays', () => {
  const broken: Problem[] = [...problems];
  const { settings, controller, applied } = controllerOver([
    { settings: defaultSettings(), problem: 'x', problems: broken },
    { settings: defaultSettings(), problem: 'x', problems: broken.slice(0, 1) },
    { settings: { ...defaultSettings(), limits: 'on' } },
  ]);
  settings.load(() => undefined);
  assert.equal(controller.state.count, 2);
  controller.reread(quiet);
  assert.equal(controller.state.count, 1, 'one problem fixed, one left');
  assert.equal(notices.length, 0);
  controller.reread(quiet);
  assert.equal(controller.state.count, 0);
  assert.equal(settings.current.limits, 'on', 'the fixed file is applied');
  assert.equal(applied.length, 2, 'the live footer was told each time');
  assert.match(notices.join('\n'), /applied your settings file/u);
});
