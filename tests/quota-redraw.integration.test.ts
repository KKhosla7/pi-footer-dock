import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { captureFooter, createStreamingSession } from './support/sdk-session.js';

await test('actual loaded runtime redraws each minute without an hourglass, quota acquisition or changed percentages', async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-quota-redraw-'));
  const { session } = await createStreamingSession(directory, 'http://127.0.0.1:1');
  session.sessionManager.appendCustomEntry('pi-footer-dock-rate-limits-v1', {
    provider: 'integration-a',
    model: 'test-model',
    windows: [{ label: '5h', remainingPercent: 59, resetAt: Date.now() / 1000 + 3600 }],
  });
  t.mock.timers.enable({ apis: ['setInterval'] });
  const capture = await captureFooter(session);
  try {
    for (const elapsed of [0, 59_999, 1, 60_000]) {
      t.mock.timers.tick(elapsed);
      const lines = capture.render();
      assert.equal(lines.length, 2);
      assert.match(lines.join('\n'), /59%/u);
      assert.doesNotMatch(lines.join('\n'), /[\uf251\uf252\uf253⧖⌛⏳]/u);
    }
    await session.prompt('/dock-debug');
    const report = JSON.parse(capture.notifications.at(-1) ?? '{}') as {
      quotaProvider: { adapter: string | null; httpStatus: number | null };
    };
    assert.equal(report.quotaProvider.adapter, null);
    assert.equal(report.quotaProvider.httpStatus, null, 'redrawing never asks a server');
    assert.deepEqual(capture.errors, []);
  } finally {
    capture.dispose();
    await setImmediate();
    t.mock.timers.tick(120_000);
    session.dispose();
    t.mock.timers.reset();
    await rm(directory, { recursive: true, force: true });
  }
});
