import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { setImmediate } from 'node:timers/promises';
import { startProviderServer } from './support/provider-server.js';
import { captureFooter, createStreamingSession } from './support/sdk-session.js';

// The fake provider reports 900 input, 25 output and 200 cache-read tokens per response.
// At 3000/15000/300 USD per million tokens that is (2.7M + 375k + 60k) / 1M = 3.135.
const PRICED = { input: 3_000, output: 15_000, cacheRead: 300, cacheWrite: 0 };

await test('a non-OpenAI model priced in Pi’s registry shows a real ≈$ figure; an unpriced one makes it partial', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-cost-'));
  const server = await startProviderServer();
  const { session, modelRuntime } = await createStreamingSession(
    directory,
    server.baseUrl,
    undefined,
    {
      costs: { 'integration-a': PRICED },
    },
  );
  const capture = await captureFooter(session);
  const text = () => capture.render(220).map(stripVTControlCharacters).join('\n');
  try {
    assert.doesNotMatch(text(), /≈/u, 'no response yet: no cost drawn');
    await session.prompt('Respond without tools.');
    await setImmediate();
    assert.deepEqual(capture.errors, []);
    assert.ok(
      Math.abs(session.getSessionStats().cost - 3.135) < 1e-9,
      'Pi itself recorded the cost',
    );
    assert.match(text(), /integration-a/u);
    assert.match(text(), /≈\$3\.14/u);
    assert.doesNotMatch(text(), /partial/u);
    const unpriced = modelRuntime.getModel('integration-b', 'test-model');
    assert.ok(unpriced);
    await session.setModel(unpriced);
    await session.prompt('Respond again without tools.');
    await setImmediate();
    assert.match(text(), /≈\$3\.14\+/u);
  } finally {
    capture.dispose();
    session.dispose();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
