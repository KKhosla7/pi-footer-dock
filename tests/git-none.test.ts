import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { stripVTControlCharacters } from 'node:util';
import { test } from 'node:test';
import { GitTracker } from '../src/adapters/git-tracker.js';
import { unknownGit } from '../src/adapters/git.js';
import { startProviderServer } from './support/provider-server.js';
import { captureFooter, createStreamingSession } from './support/sdk-session.js';

await test('a folder that is not a Git repository is nothing to show, not a failure', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-nogit-'));
  const tracker = new GitTracker(() => undefined);
  try {
    tracker.start(directory);
    for (let attempt = 0; attempt < 100 && tracker.stats()?.health !== 'none'; attempt += 1)
      await delay(50);
    assert.equal(tracker.stats()?.health, 'none');
    assert.deepEqual(tracker.state, unknownGit, 'no "unavailable" flag: nothing is wrong');
    assert.equal(tracker.stats()?.failure, 'not-repository');
  } finally {
    tracker.stop();
    await rm(directory, { recursive: true, force: true });
  }
});

await test('in a real Pi session in a folder without Git, the footer shows no Git item and no complaint', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-nogit-'));
  const server = await startProviderServer();
  const { session } = await createStreamingSession(directory, server.baseUrl);
  const capture = await captureFooter(session);
  try {
    await delay(800);
    const text = capture.render(160).map(stripVTControlCharacters).join('\n');
    assert.doesNotMatch(text, /Git unavailable/u);
    assert.match(text, /nogit/u, 'the folder is still shown');
    assert.deepEqual(capture.errors, []);
  } finally {
    capture.dispose();
    session.dispose();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
