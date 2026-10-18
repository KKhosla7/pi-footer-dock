import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { startProviderServer } from './support/provider-server.js';
import { createStreamingSession } from './support/sdk-session.js';
import { cliDiagnostic } from './support/cli-diagnostic.js';

await test('CLI -e starts a separate empty session; --session restores the intended conversation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-launch-'));
  const sessionDir = join(directory, 'sessions');
  const server = await startProviderServer();
  const manager = SessionManager.create(directory, sessionDir);
  const { session } = await createStreamingSession(directory, server.baseUrl, manager);
  try {
    await session.prompt('Create streamed history for the CLI launch acceptance test.');
    const path = manager.getSessionFile();
    assert.ok(path);
    await writeFile(
      join(directory, 'models.json'),
      JSON.stringify({
        providers: {
          'integration-a': {
            baseUrl: server.baseUrl,
            api: 'openai-completions',
            apiKey: 'fixture-only',
            models: [
              {
                id: 'test-model',
                name: 'Test model',
                input: ['text'],
                reasoning: false,
                contextWindow: 64_000,
                maxTokens: 1024,
              },
            ],
          },
        },
      }),
    );
    const options = { cwd: directory, agentDir: directory, sessionDir };
    const fresh = await cliDiagnostic(options);
    assert.ok(
      !fresh.includes(manager.getSessionId()),
      'fresh launch incorrectly reused the other session',
    );
    assert.ok(fresh.includes('"assistantMessages": 0'));
    assert.ok(fresh.includes('"input": 0'));
    assert.ok(fresh.includes('"tokens": 0'));
    const resumed = await cliDiagnostic({ ...options, resume: path });
    assert.ok(
      resumed.includes(manager.getSessionId()),
      'explicit resume did not bind the intended session',
    );
    assert.ok(resumed.includes('"assistantMessages": 1'));
    assert.ok(resumed.includes('"input": 900'));
    assert.ok(resumed.includes('"output": 25'));
    assert.ok(resumed.includes('"cacheRead": 200'));
  } finally {
    session.dispose();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
