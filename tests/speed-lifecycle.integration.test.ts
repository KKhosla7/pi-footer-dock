import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { startTimedProvider } from './support/timed-provider-server.js';
import { captureFooter, createStreamingSession } from './support/sdk-session.js';

await test('loaded extension clears the previous speed before the next turn makes its HTTP request', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-speed-'));
  const server = await startTimedProvider();
  const { session } = await createStreamingSession(directory, server.baseUrl);
  const capture = await captureFooter(session);
  const starts: string[] = [];
  const unsubscribe = session.subscribe((event) => {
    if (event.type === 'turn_start')
      starts.push(capture.render().map(stripVTControlCharacters).join('\n'));
  });
  try {
    await session.prompt(
      '/dock-config {"rows":[{"left":["model"],"right":[]},{"left":["speed"],"right":["cost"]}]}',
    );
    await session.prompt('Local fixture response.');
    assert.match(capture.render().join('\n'), /tok\/s/u);
    await session.prompt('Second local fixture response.');
    assert.equal(starts.length, 2);
    for (const frame of starts) assert.ok(!frame.includes('tok/s'), frame);
    assert.match(capture.render().join('\n'), /tok\/s/u);
    assert.deepEqual(capture.errors, []);
  } finally {
    unsubscribe();
    capture.dispose();
    session.dispose();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
