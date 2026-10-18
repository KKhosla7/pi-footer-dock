import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { captureFooter, createStreamingSession } from './support/sdk-session.js';
import { startProviderServer } from './support/provider-server.js';

for (const api of ['openai-completions', 'openai-responses'] as const) {
  await test(`active openai/${api}: actual response headers reach the loaded extension and show API remaining limits`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'dock-openai-headers-'));
    const server = await startProviderServer(
      undefined,
      {
        'x-ratelimit-limit-tokens': '1000',
        'x-ratelimit-remaining-tokens': '250',
        'x-ratelimit-reset-tokens': '1h',
        'x-ratelimit-limit-requests': '10',
        'x-ratelimit-remaining-requests': '6',
        'x-ratelimit-reset-requests': '10m',
      },
      api === 'openai-responses' ? 'responses' : 'completions',
    );
    const { session, modelRuntime } = await createStreamingSession(directory, server.baseUrl);
    modelRuntime.registerProvider('openai', {
      baseUrl: server.baseUrl,
      api,
      apiKey: 'fixture-only',
      models: [
        {
          id: 'test-model',
          name: 'Test',
          input: ['text'],
          reasoning: false,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: 272000,
          maxTokens: 1024,
        },
      ],
    });
    const model = modelRuntime.getModel('openai', 'test-model');
    assert.ok(model);
    await session.setModel(model);
    const capture = await captureFooter(session);
    try {
      assert.match(
        capture.render().map(stripVTControlCharacters).join('\n'),
        /account quota unavailable/u,
      );
      await session.prompt('Fixture response only.');
      const rendered = capture.render().map(stripVTControlCharacters).join('\n');
      assert.match(rendered, /API tokens (?:[▰▱]{7} )?25%.*API requests (?:[▰▱]{7} )?60%/u);
      assert.doesNotMatch(rendered, /5h|week|month/u);
      assert.doesNotMatch(rendered, /\(\d+s old\)/u);
      await session.prompt('/dock-debug');
      const report = JSON.parse(capture.notifications.at(-1) ?? '{}') as {
        headerEvents: { received: number; accepted: number };
      };
      assert.equal(report.headerEvents.received, 1);
      assert.equal(report.headerEvents.accepted, 1);
      assert.deepEqual(capture.errors, []);
    } finally {
      capture.dispose();
      session.dispose();
      await server.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
}
