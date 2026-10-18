import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { record } from '../src/core/usage-values.js';
import { createGitRepository, waitForGit } from './support/git-fixtures.js';
import { startGitToolProvider } from './support/git-tool-provider.js';
import { createStreamingSession, captureFooter } from './support/sdk-session.js';

await test('production footer reflects native Pi write/edit before agent_end, without extra inference', async () => {
  const f = await createGitRepository();
  const server = await startGitToolProvider();
  const { session } = await createStreamingSession(f.cwd, server.baseUrl, undefined, {
    tools: ['write', 'edit'],
  });
  const capture = await captureFooter(session);
  const text = () => capture.render().map(stripVTControlCharacters).join('\n');
  let toolEnds = 0;
  let agentEnds = 0;
  let pending: Promise<void> | undefined;
  const unsubscribe = session.subscribe((event) => {
    if (event.type === 'tool_execution_end') toolEnds += 1;
    if (event.type === 'agent_end') agentEnds += 1;
  });
  try {
    await waitForGit(() => text().includes('0 files'));
    pending = session.prompt('Synthetic native write/edit fixture.');
    await waitForGit(() => server.held() && toolEnds === 2);
    await waitForGit(() => text().includes('2 files'));
    assert.equal(session.isStreaming, true);
    assert.equal(agentEnds, 0);
    assert.equal(server.requests(), 3);
    assert.equal(await readFile(join(f.cwd, 'new.txt'), 'utf8'), 'created by native Pi tool\n');
    assert.equal(await readFile(join(f.cwd, 'tracked.txt'), 'utf8'), 'edited by native Pi tool\n');
    server.finish();
    await pending;
    assert.equal(session.getLastAssistantText(), 'Native tool fixture complete.');
    await session.prompt('/dock-debug');
    const diagnostic: unknown = JSON.parse(capture.notifications.at(-1) ?? '{}');
    const monitor = record(record(diagnostic)?.gitMonitor);
    assert.equal(monitor?.health, 'ready');
    assert.equal(monitor.peakReads, 1);
    assert.equal(record(record(record(diagnostic)?.cachedFooter)?.git)?.changed, 2);
    assert.deepEqual(capture.errors, []);
    assert.equal(server.requests(), 3);
  } finally {
    await session.abort();
    await pending;
    unsubscribe();
    capture.dispose();
    session.dispose();
    await server.close();
    await f.close();
  }
});
