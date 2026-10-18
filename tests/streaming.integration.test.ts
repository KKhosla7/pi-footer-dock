import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { setImmediate } from 'node:timers/promises';
import { startProviderServer } from './support/provider-server.js';
import { captureFooter, createStreamingSession } from './support/sdk-session.js';

await test('real streaming provider → Pi persistence/context → loaded extension → rendered footer', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-stream-'));
  const server = await startProviderServer();
  const { session, modelRuntime } = await createStreamingSession(directory, server.baseUrl);
  const capture = await captureFooter(session);
  try {
    assert.match(capture.render().map(stripVTControlCharacters).join('\n'), /↑ 0/u);
    await session.prompt('Respond without tools.');
    await setImmediate();
    assert.equal(session.getLastAssistantText(), 'Integration response.');
    assert.deepEqual(capture.errors, []);
    assert.ok((session.getContextUsage()?.tokens ?? 0) >= 1125);
    assert.equal(session.getSessionStats().tokens.input, 900);
    assert.equal(session.getSessionStats().tokens.output, 25);
    assert.equal(session.getSessionStats().tokens.cacheRead, 200);
    const first = capture.render().map(stripVTControlCharacters).join('\n');
    assert.match(first, /of 64k/u);
    assert.match(first, /↑ 900.*↓ 25.*last 18.2% · 200 read/u);
    assert.ok(!first.includes('0% of'));
    const next = modelRuntime.getModel('integration-b', 'test-model');
    assert.ok(next);
    await session.setModel(next);
    assert.match(capture.render().map(stripVTControlCharacters).join('\n'), /of 128k/u);
    await session.prompt('Respond again without tools.');
    await setImmediate();
    assert.deepEqual(capture.errors, []);
    assert.match(
      capture.render().map(stripVTControlCharacters).join('\n'),
      /↑ 2k.*↓ 50.*last 18.2% · 200 read/u,
    );
    assert.equal(session.getSessionStats().tokens.cacheRead, 400);
    await session.prompt('/dock-refresh');
    await session.prompt('/dock-debug');
    const diagnostics = capture.notifications.at(-1);
    assert.ok(diagnostics);
    assert.ok(diagnostics.includes('integration-b'));
    assert.ok(diagnostics.includes('"assistantMessages": 2'));
    await session.bindExtensions({
      mode: 'tui',
      uiContext: session.extensionRunner.getUIContext(),
    });
    assert.match(capture.render().map(stripVTControlCharacters).join('\n'), /↑ 2k.*↓ 50/u);
  } finally {
    capture.dispose();
    session.dispose();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
