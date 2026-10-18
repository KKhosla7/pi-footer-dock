import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { startTimedProvider } from './support/timed-provider-server.js';
import { captureFooter, createStreamingSession } from './support/sdk-session.js';

await test('actual SDK HTTP failure cannot produce speed or replace the last successful primary cache sample', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-telemetry-failure-'));
  const server = await startTimedProvider({ read: 800, failAfter: 1 });
  const { session } = await createStreamingSession(directory, server.baseUrl);
  const capture = await captureFooter(session);
  try {
    await session.prompt('Synthetic successful response.');
    assert.match(capture.render().join('\n'), /tok\/s/u);
    await session.prompt('Synthetic HTTP failure.');
    assert.equal(
      session.messages.findLast((message) => message.role === 'assistant')?.stopReason,
      'error',
    );
    assert.doesNotMatch(capture.render().join('\n'), /tok\/s/u);
    await session.prompt('/dock-info cache');
    assert.match(capture.notifications.at(-1) ?? '', /Read\s+800 tokens/u);
    assert.equal(server.requests(), 2);
    assert.deepEqual(capture.errors, []);
  } finally {
    capture.dispose();
    session.dispose();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

await test('actual SDK abort during delayed headers clears speed without extra requests or fabricated cache data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-telemetry-abort-'));
  const server = await startTimedProvider({ read: 800, headerDelayMs: 150 });
  const { session } = await createStreamingSession(directory, server.baseUrl);
  const capture = await captureFooter(session);
  try {
    await session.prompt('Synthetic successful response.');
    assert.match(capture.render().join('\n'), /tok\/s/u);
    const pending = Promise.allSettled([session.prompt('Synthetic aborted response.')]);
    for (let step = 0; step < 100 && server.requests() < 2; step += 1) await delay(5);
    assert.equal(server.requests(), 2);
    assert.doesNotMatch(capture.render().join('\n'), /tok\/s/u);
    await session.abort();
    await pending;
    assert.equal(
      session.messages.findLast((message) => message.role === 'assistant')?.stopReason,
      'aborted',
    );
    assert.doesNotMatch(capture.render().join('\n'), /tok\/s/u);
    await session.prompt('/dock-info cache');
    assert.match(capture.notifications.at(-1) ?? '', /Read\s+800 tokens/u);
    assert.equal(server.requests(), 2);
    assert.deepEqual(capture.errors, []);
  } finally {
    capture.dispose();
    session.dispose();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
