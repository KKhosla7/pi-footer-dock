import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import { startTimedProvider } from './support/timed-provider-server.js';
import { captureFooter, createStreamingSession } from './support/sdk-session.js';

await test('real SDK response duration includes delayed HTTP headers and body, with primary turn ordering', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-timing-contract-'));
  const server = await startTimedProvider();
  const { session } = await createStreamingSession(directory, server.baseUrl);
  const capture = await captureFooter(session);
  const completed: AssistantMessage[] = [];
  const order: string[] = [];
  const unsubscribe = session.subscribe((event) => {
    if (event.type === 'turn_start') order.push(event.type);
    if (event.type === 'message_start' && event.message.role === 'assistant') order.push('start');
    if (event.type === 'message_end' && event.message.role === 'assistant') {
      completed.push(event.message);
      order.push('end');
    }
  });
  try {
    await session.prompt('Synthetic timing fixture.');
    const result = completed.at(-1);
    assert.ok(result);
    assert.equal(result.stopReason, 'stop');
    assert.equal(result.usage.output, 25);
    assert.ok(typeof result.durationMs === 'number' && result.durationMs >= 185);
    assert.deepEqual(order, ['turn_start', 'start', 'end']);
    assert.equal(server.requests(), 1);
    const expected = (25 / (result.durationMs / 1000)).toFixed(1);
    assert.ok(capture.render().join('\n').includes(`${expected} tok/s`));
    await session.prompt('/dock-info speed');
    assert.match(
      capture.notifications.at(-1) ?? '',
      new RegExp(`Duration\\s+${(result.durationMs / 1000).toFixed(2)} s`, 'u'),
    );
    assert.equal(server.requests(), 1, 'telemetry/help must never perform inference');
    assert.deepEqual(capture.errors, []);
  } finally {
    unsubscribe();
    capture.dispose();
    session.dispose();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

await test('real SDK normalizes disjoint prompt/read/write counters from a local provider', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-cache-contract-'));
  const server = await startTimedProvider({ prompt: 1000, read: 800, write: 100 });
  const { session } = await createStreamingSession(directory, server.baseUrl);
  const completed: AssistantMessage[] = [];
  const unsubscribe = session.subscribe((event) => {
    if (event.type === 'message_end' && event.message.role === 'assistant')
      completed.push(event.message);
  });
  try {
    await session.prompt('Synthetic cache fixture.');
    const usage = completed.at(-1)?.usage;
    assert.ok(usage);
    assert.equal(usage.input, 100);
    assert.equal(usage.cacheRead, 800);
    assert.equal(usage.cacheWrite, 100);
    assert.equal(usage.cacheRead / (usage.input + usage.cacheRead + usage.cacheWrite), 0.8);
    assert.equal(server.requests(), 1);
  } finally {
    unsubscribe();
    session.dispose();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
