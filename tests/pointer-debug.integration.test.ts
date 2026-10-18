import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureFooter, createStreamingSession } from './support/sdk-session.js';

await test('loaded diagnostic command is off by default and traces keyboard registry failures without content', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-pointer-debug-'));
  const { session } = await createStreamingSession(directory, 'http://127.0.0.1:1');
  const capture = await captureFooter(session);
  const report = () =>
    JSON.parse(capture.notifications.at(-1) ?? '{}') as {
      enabled: boolean;
      records: { layer: string; event: string; source?: string; result?: string }[];
    };
  try {
    await session.prompt('/dock-pointer-debug show');
    assert.equal(report().enabled, false);
    assert.deepEqual(report().records, []);
    await session.prompt('/dock-pointer-debug on');
    await session.prompt('/dock-context');
    await session.prompt('/dock-pointer-debug show');
    assert.ok(report().records.some((record) => record.source === 'keyboard'));
    assert.ok(report().records.some((record) => record.result === 'unavailable'));
    assert.ok(!JSON.stringify(report()).includes('/dock-context'));
    await session.prompt('/dock-pointer-debug off');
    await session.prompt('/dock-pointer-debug clear');
    await session.prompt('/dock-pointer-debug show');
    assert.equal(report().enabled, false);
    assert.deepEqual(report().records, []);
    assert.deepEqual(capture.errors, []);
  } finally {
    capture.dispose();
    session.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
