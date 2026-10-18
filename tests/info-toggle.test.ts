import assert from 'node:assert/strict';
import { setTimeout as sleep } from 'node:timers/promises';
import { test } from 'node:test';
import { closeInfoScreen } from '../src/ui/info-screen.js';
import { screensHarness } from './support/interactions-harness.js';

const screens = screensHarness;
async function until(done: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 400 && !done(); attempt += 1) await sleep(5);
  assert.ok(done(), 'timed out waiting');
}

await test('the icon opens its screen, the same icon again closes it, and once more opens it again', async () => {
  const { interactions, ctx, log } = screens();
  const first = interactions.activate('branch:icon', ctx);
  await until(() => log.opened === 1);
  await interactions.activate('branch:icon', ctx);
  await first;
  assert.deepEqual(
    [log.opened, log.closed],
    [1, 1],
    'the second click closed it and opened nothing',
  );
  const third = interactions.activate('branch:icon', ctx);
  await until(() => log.opened === 2);
  closeInfoScreen();
  await third;
  assert.deepEqual([log.opened, log.closed], [2, 2]);
});

await test('another icon switches: the open screen closes and the new one opens', async () => {
  const { interactions, ctx, log } = screens();
  const branches = interactions.activate('branch:icon', ctx);
  await until(() => log.opened === 1);
  const files = interactions.activate('changes:icon', ctx);
  await branches;
  await until(() => log.opened === 2);
  assert.deepEqual([log.opened, log.closed], [2, 1]);
  await interactions.activate('changes:icon', ctx);
  await files;
  assert.deepEqual([log.opened, log.closed], [2, 2]);
});

await test('a click on the text opens its explanation as a screen; the same click closes it', async () => {
  const { interactions, ctx, log, shown } = screens();
  closeInfoScreen();
  const first = interactions.activate('branch', ctx);
  await until(() => log.opened === 1);
  assert.match(
    shown(0),
    /Footer Dock › About Git branch/u,
    'titled as an explanation of the item, not the feature screen',
  );
  assert.match(shown(0), /Shows\s+\S/u, 'with the value');
  assert.match(shown(0), /What it reports/u, 'and its explanation');
  await interactions.activate('branch', ctx);
  await first;
  assert.deepEqual([log.opened, log.closed], [1, 1]);
});

await test('the icon of an item switches from its explanation to its own screen, and back', async () => {
  const { interactions, ctx, log, shown } = screens();
  const text = interactions.activate('ahead', ctx);
  await until(() => log.opened === 1);
  const icon = interactions.activate('ahead:icon', ctx);
  await text;
  await until(() => log.opened === 2);
  assert.match(shown(1), /Footer Dock › Ahead of upstream/u);
  const again = interactions.activate('ahead', ctx);
  await icon;
  await until(() => log.opened === 3);
  assert.match(shown(2), /Footer Dock › About Commits ahead/u, 'back to the explanation');
  closeInfoScreen();
  await again;
  assert.deepEqual([log.opened, log.closed], [3, 3]);
});

await test('after Esc the next click opens the screen again, not closes a screen that is gone', async () => {
  const { interactions, ctx, log } = screens();
  const first = interactions.activate('changes:icon', ctx);
  await until(() => log.opened === 1);
  closeInfoScreen();
  await first;
  const again = interactions.activate('changes:icon', ctx);
  await until(() => log.opened === 2);
  closeInfoScreen();
  await again;
  assert.deepEqual([log.opened, log.closed], [2, 2]);
});
