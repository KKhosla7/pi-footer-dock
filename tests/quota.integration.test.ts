import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { startProviderServer } from './support/provider-server.js';
import { captureFooter, createStreamingSession } from './support/sdk-session.js';

await test('unsupported active provider is explicit and diagnostics confirm no Codex HTTP requests', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-quota-unsupported-'));
  const { session } = await createStreamingSession(directory, 'http://127.0.0.1:1');
  const capture = await captureFooter(session);
  try {
    assert.match(capture.render().map(stripVTControlCharacters).join('\n'), /quota unsupported/u);
    await session.prompt('/dock-debug');
    const report = JSON.parse(capture.notifications.at(-1) ?? '{}') as {
      quotaProvider: { adapter: string | null; failure: string; httpStatus: number | null };
    };
    assert.equal(report.quotaProvider.adapter, null, 'no quota source serves this provider');
    assert.equal(report.quotaProvider.failure, 'not-requested');
    assert.equal(report.quotaProvider.httpStatus, null, 'and nothing was requested');
    assert.deepEqual(capture.errors, []);
  } finally {
    capture.dispose();
    session.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});

await test('public stream callback displays remaining quotas and survives footer reload', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-quota-'));
  const resetAt = Math.floor(Date.now() / 1000) + 3600;
  const server = await startProviderServer({
    type: 'codex.rate_limits',
    rate_limits: {
      primary: { used_percent: 20, window_minutes: 300, reset_at: resetAt },
      secondary: { used_percent: 70, window_minutes: 10_080, reset_at: resetAt },
    },
  });
  const { session } = await createStreamingSession(directory, server.baseUrl);
  const capture = await captureFooter(session);
  try {
    await session.prompt('Respond without tools.');
    const rendered = capture.render().map(stripVTControlCharacters).join('\n');
    assert.match(rendered, /5h (?:[▰▱]{7} )?80%.*week (?:[▰▱]{7} )?30%/u);
    await session.prompt('/dock-debug');
    const report = JSON.parse(capture.notifications.at(-1) ?? '{}') as {
      quotaEvents: { received: number; parsed: number; accepted: number };
    };
    assert.ok(report.quotaEvents.received > 0);
    assert.equal(report.quotaEvents.parsed, 1);
    assert.equal(report.quotaEvents.accepted, 1);
    assert.deepEqual(capture.errors, []);
    const rebound = await captureFooter(session);
    try {
      assert.match(
        rebound.render().map(stripVTControlCharacters).join('\n'),
        /5h (?:[▰▱]{7} )?80%.*week (?:[▰▱]{7} )?30%/u,
      );
    } finally {
      rebound.dispose();
    }
  } finally {
    capture.dispose();
    session.dispose();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
