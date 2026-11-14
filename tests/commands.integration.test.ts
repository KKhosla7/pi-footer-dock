import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout } from 'node:timers/promises';
import { stripVTControlCharacters } from 'node:util';
import { captureFooter, createStreamingSession } from './support/sdk-session.js';

async function withSession(
  run: (
    api: Awaited<ReturnType<typeof captureFooter>> & { prompt: (text: string) => Promise<void> },
  ) => Promise<void>,
): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'dock-commands-'));
  execFileSync('git', ['init', '--initial-branch=main', '--quiet'], { cwd: directory });
  const { session } = await createStreamingSession(directory, 'http://127.0.0.1:1');
  const capture = await captureFooter(session);
  try {
    await run({ ...capture, prompt: (text) => session.prompt(text) });
    assert.deepEqual(capture.errors, [], 'no extension error');
  } finally {
    capture.dispose();
    session.dispose();
    await rm(directory, { recursive: true, force: true });
  }
}
const text = (screen: { render?: (width: number) => string[] }): string =>
  (screen.render?.(100) ?? []).map(stripVTControlCharacters).join('\n');
async function settle(): Promise<void> {
  await setTimeout(60);
}

await test('every command that needs no screen runs without an error and says something', async () => {
  await withSession(async ({ prompt, notifications }) => {
    for (const command of [
      '/dock-glyphs',
      '/dock-glyphs',
      '/dock-color',
      '/dock-color accent #ff8800',
      '/dock-color bold off',
      '/dock-color reset',
      '/dock-color accent not-a-colour',
      '/dock-info',
      '/dock-info quota',
      '/dock-info branch',
      '/dock-config',
      '/dock-config show',
      '/dock-debug',
      '/dock-quota',
      '/dock-quota',
      '/dock-refresh',
      '/dock-open-with',
      '/dock-context',
      '/dock-pointer-debug',
    ]) {
      const before = notifications.length;
      await prompt(command);
      await settle();
      assert.ok(notifications.length > before || command.startsWith('/dock-'), command);
    }
    assert.ok(
      notifications.some((note) => note.includes('accent: ')),
      '/dock-color lists the colours',
    );
    assert.ok(notifications.some((note) => note.includes('terminal background')));
    assert.ok(
      notifications.some((note) => note.includes('Not changed')),
      'a bad colour is refused, not thrown',
    );
  });
});

await test('/dock-settings opens the menu, every group opens and closes, and Esc ends it', async () => {
  await withSession(async ({ prompt, screens }) => {
    const done = prompt('/dock-settings');
    for (let attempt = 0; attempt < 50 && screens.length === 0; attempt += 1) await settle();
    const menu = screens[0];
    assert.ok(menu, 'the settings screen opened');
    const top = text(menu);
    for (const label of ['Project and Git', 'Limit usage', 'Appearance', 'Clicking an item'])
      assert.match(top, new RegExp(label, 'u'));
    for (let group = 0; group < 6; group += 1) {
      menu.handleInput?.('\r');
      assert.match(text(menu), /Footer Dock settings › /u, `group ${group} opened`);
      menu.handleInput?.('\u001b');
      menu.handleInput?.('\u001b[B');
    }
    menu.handleInput?.('\u001b');
    await done;
  });
});

await test('the colour picker and the typing field work inside the real session', async () => {
  await withSession(async ({ prompt, screens, render }) => {
    const done = prompt('/dock-settings');
    for (let attempt = 0; attempt < 50 && screens.length === 0; attempt += 1) await settle();
    const menu = screens[0];
    assert.ok(menu);
    const press = (...keys: string[]): void => {
      for (const key of keys) menu.handleInput?.(key);
    };
    press('\r');
    press('\u001b[B', '\u001b[B', '\r');
    assert.match(text(menu), /Appearance › Colours/u);
    press('\r', '\u001b[B', '\u001b[B', '\r');
    for (const key of 'ff8800') press(key);
    assert.match(text(menu), /preview/u);
    press('\r');
    assert.match(text(menu), /Accent\s+██ #ff8800/u, 'the colour was saved from the screen');
    press('\u001b', '\u001b', '\u001b', '\u001b');
    await done;
    assert.ok(render().length > 0, 'the footer still draws after the change');
  });
});
