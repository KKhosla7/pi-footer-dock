import { quietExtensions } from './support/quiet-extensions.js';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import { defaultSettings } from '../src/core/settings.js';
import { FooterInteractions } from '../src/footer-interactions.js';
import { portableGlyphs } from '../src/ui/glyphs.js';
import { demoSnapshot } from './reference.js';
import { harness, screensHarness } from './support/interactions-harness.js';

await test('the folder icon opens the session folder; the path text opens an explanation instead', async () => {
  const { interactions, ctx, opened, log, shown } = screensHarness();
  const text = interactions.activate('workspace', ctx);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(opened, [], 'the text does not open the folder');
  assert.match(shown(log.opened - 1), /About Project folder/u);
  await interactions.activate('workspace', ctx);
  await text;
  await interactions.activate('workspace:icon', ctx);
  assert.deepEqual(opened, ['/work/project']);
});

await test('clicks within a second are ignored, so a double click opens one window', async () => {
  const { interactions, ctx, opened } = harness();
  await interactions.activate('workspace:icon', ctx);
  await interactions.activate('workspace:icon', ctx);
  await interactions.openFolder(ctx);
  assert.equal(opened.length, 1);
});

await test('"explain only" makes the icon explain too: a screen about the item, no launch', async () => {
  const { interactions, ctx, opened, log, shown } = screensHarness({
    ...defaultSettings(),
    clicks: 'explain',
  });
  const open = interactions.activate('workspace:icon', ctx);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.deepEqual(opened, []);
  assert.equal(log.opened, 1);
  assert.match(shown(0), /About Project folder/u);
  await interactions.activate('workspace:icon', ctx);
  await open;
});

await test('a failed launch tells the user how to choose another app', async () => {
  const { interactions, ctx, notices } = harness(defaultSettings(), {
    ok: false,
    message: 'Could not start "xdg-open". Choose another app with /dock-open-with.',
  });
  await interactions.activate('workspace:icon', ctx);
  assert.equal(notices.at(-1)?.level, 'warning');
  assert.match(notices.at(-1)?.message ?? '', /dock-open-with/u);
});

await test('outside the TUI nothing is launched', async () => {
  const { interactions, ctx, opened } = harness();
  await interactions.openFolder({ ...ctx, mode: 'print' } as unknown as ExtensionContext);
  assert.deepEqual(opened, []);
});

await test('the branch, changed-files and ahead icons open their own screen; their text opens the explanation', async () => {
  const own = {
    branch: /› Branches\n/u,
    changes: /› Changed files\n/u,
    ahead: /› Ahead of upstream\n/u,
  };
  const explained = {
    branch: /About Git branch/u,
    changes: /About Changed files/u,
    ahead: /About Commits ahead/u,
  };
  for (const id of ['branch', 'changes', 'ahead'] as const) {
    const { interactions, ctx, log, shown } = screensHarness();
    const text = interactions.activate(id, ctx);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.match(shown(0), explained[id], `${id} text explains`);
    assert.doesNotMatch(shown(0), own[id]);
    await interactions.activate(id, ctx);
    await text;
    const icon = interactions.activate(`${id}:icon`, ctx);
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(log.opened, 2);
    assert.match(shown(1), own[id], `${id} icon opens its own screen`);
    await interactions.activate(`${id}:icon`, ctx);
    await icon;
  }
});

await test('when clicks only explain, an icon opens the explanation, never its own screen', async () => {
  const { interactions, ctx, log, shown } = screensHarness({
    ...defaultSettings(),
    clicks: 'explain',
  });
  const open = interactions.activate('changes:icon', ctx);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(log.opened, 1);
  assert.match(shown(0), /About Changed files/u);
  assert.doesNotMatch(shown(0), /› Changed files\n/u, 'not the feature screen');
  await interactions.activate('changes:icon', ctx);
  await open;
});

await test('the explanation of the quota lists every window, even when the footer shows it collapsed', () => {
  const withQuota = {
    ...demoSnapshot,
    rateLimits: {
      provider: 'p',
      model: 'm',
      windows: [
        { label: '5h', remainingPercent: 100, resetAt: 4_100_000_000 },
        { label: 'week', remainingPercent: 80, resetAt: 4_100_100_000 },
        { label: 'month', remainingPercent: 0, resetAt: 4_100_900_000 },
      ],
    },
  };
  const notices: string[] = [];
  const pi = {
    events: { on: () => () => undefined, emit: () => undefined },
    appendEntry: () => undefined,
  };
  const settings = { ...defaultSettings(), slots: { quota: { collapse: 'always' as const } } };
  const interactions = new FooterInteractions(
    pi as unknown as ExtensionAPI,
    () => withQuota,
    () => undefined,
    {
      redraw: () => undefined,
      extensions: quietExtensions(),
      glyphs: () => portableGlyphs,
      settings: () => settings,
      openFolder: () => Promise.resolve({ ok: true }),
    },
  );
  const ctx = {
    mode: 'tui',
    cwd: '/x',
    sessionManager: { getBranch: () => [] },
    ui: {
      notify: (message: string) => notices.push(message),
      select: () => Promise.resolve(undefined),
    },
  } as unknown as ExtensionContext;
  interactions.start(ctx);
  interactions.explain('quota', ctx);
  for (const label of ['5h', 'week', 'month'])
    assert.match(notices.at(-1) ?? '', new RegExp(label, 'u'));
});
