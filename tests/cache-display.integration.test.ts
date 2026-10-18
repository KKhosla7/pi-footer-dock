import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { startTimedProvider } from './support/timed-provider-server.js';
import { captureFooter, createStreamingSession } from './support/sdk-session.js';

await test('actual SDK near-full cache stays below 100% and retained samples are labelled last during the next response', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-cache-last-'));
  const server = await startTimedProvider({ prompt: 222100, read: 222000, write: 0 });
  const { session } = await createStreamingSession(directory, server.baseUrl);
  session.setAutoCompactionEnabled(false);
  const capture = await captureFooter(session);
  const frames: string[] = [];
  const render = () => capture.render().map(stripVTControlCharacters).join('\n');
  const unsubscribe = session.subscribe((event) => {
    if (event.type === 'message_start') frames.push(render());
  });
  try {
    assert.match(render(), /cache pending/u);
    await session.prompt('Synthetic near-full cache response.');
    assert.match(render(), /last <100% · 222k read/u);
    assert.doesNotMatch(render(), /last 100%|W0|R222k/u);
    await session.prompt('Synthetic second response.');
    assert.ok(frames.some((frame) => frame.includes('last <100% · 222k read')));
    await session.prompt('/dock-info cache');
    const help = capture.notifications.at(-1) ?? '';
    assert.match(help, /<100% reused/u);
    assert.match(help, /Last response/u);
    assert.match(help, /Written\s+not reported/u);
    assert.equal(server.requests(), 2);
    assert.equal(capture.render().length, 2);
    assert.deepEqual(capture.errors, []);
  } finally {
    unsubscribe();
    capture.dispose();
    session.dispose();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

await test('default zero-read cache has readable wording without claiming a miss', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-cache-none-'));
  const server = await startTimedProvider({ prompt: 1000, read: 0, write: 0 });
  const { session } = await createStreamingSession(directory, server.baseUrl);
  const capture = await captureFooter(session);
  try {
    await session.prompt('Synthetic normalized-zero cache response.');
    const text = capture.render().map(stripVTControlCharacters).join('\n');
    assert.match(text, /last not reported/u);
    assert.doesNotMatch(text, /R0|W0|cache miss/u);
    assert.equal(server.requests(), 1);
    assert.deepEqual(capture.errors, []);
  } finally {
    capture.dispose();
    session.dispose();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
