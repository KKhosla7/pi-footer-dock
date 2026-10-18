import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { stripVTControlCharacters } from 'node:util';
import { test } from 'node:test';
import { startProviderServer } from './support/provider-server.js';
import { captureFooter, createStreamingSession } from './support/sdk-session.js';

await test('/reload and shutdown with work still pending cause no uncaught error, and the footer draws again', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-reload-'));
  const server = await startProviderServer({ type: 'ignored' });
  const { session } = await createStreamingSession(directory, server.baseUrl);
  const escaped: unknown[] = [];
  const catcher = (error: unknown): void => {
    escaped.push(error);
  };
  process.on('uncaughtException', catcher);
  process.on('unhandledRejection', catcher);
  const first = await captureFooter(session);
  try {
    await session.prompt('Respond without tools.');
    // The refresh after persistence is still queued when the reload starts.
    await session.prompt('And again.');
    await session.reload();
    const second = await captureFooter(session);
    try {
      await session.prompt('After the reload.');
      await delay(200);
      const text = second.render(200).map(stripVTControlCharacters).join('\n');
      assert.match(text, /test-model/u, 'the footer draws after the reload');
      await session.prompt('/dock-debug');
      const report = second.notifications.at(-1) ?? '';
      assert.ok(!report.includes(homedir()), 'the diagnostics carry no home folder');
      assert.ok(!report.includes('file://'), 'and no module address');
      assert.deepEqual(second.errors, []);
    } finally {
      second.dispose();
    }
    assert.deepEqual(first.errors, []);
  } finally {
    first.dispose();
    session.dispose();
    await delay(300);
    process.off('uncaughtException', catcher);
    process.off('unhandledRejection', catcher);
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
  assert.deepEqual(escaped, []);
});
