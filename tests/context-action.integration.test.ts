import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { captureFooter, createStreamingSession } from './support/sdk-session.js';

await test('/dock-context operates independently and invokes arbitrary registered providers', async () => {
  for (const withProvider of [false, true]) {
    const directory = await mkdtemp(join(tmpdir(), 'dock-actions-'));
    const { session } = await createStreamingSession(
      directory,
      'http://127.0.0.1:1',
      undefined,
      withProvider ? [resolve('tests/support/action-provider.ts')] : [],
    );
    const capture = await captureFooter(session);
    try {
      await session.prompt('/dock-context');
      const entries = session.sessionManager
        .getEntries()
        .filter(
          (entry) => entry.type === 'custom' && entry.customType === 'fixture-context-invocation',
        );
      assert.equal(entries.length, withProvider ? 1 : 0);
      if (!withProvider) assert.match(capture.notifications.at(-1) ?? '', /No context action/u);
      assert.deepEqual(capture.errors, []);
      assert.equal(capture.render().length, 2);
    } finally {
      capture.dispose();
      session.dispose();
      await rm(directory, { recursive: true, force: true });
    }
  }
});
