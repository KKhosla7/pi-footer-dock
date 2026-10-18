import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { captureFooter, createStreamingSession } from './support/sdk-session.js';

await test('loaded footer configuration, explanations and newly bound targets persist/re-discover without provider coupling', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-dynamic-'));
  const { session } = await createStreamingSession(directory, 'http://127.0.0.1:1', undefined, [
    resolve('tests/support/config-provider.ts'),
  ]);
  const capture = await captureFooter(session);
  const config = {
    rows: [
      { left: ['custom', 'cost'], right: ['model'] },
      { left: ['context', 'input'], right: [] },
    ],
    slots: {
      custom: {
        icon: '★',
        text: '{icon} Details',
        help: 'Custom explanation',
        click: 'action',
        actionTarget: 'vendor-details',
      },
    },
  };
  try {
    await session.prompt('/dock-info speed');
    assert.match(capture.notifications.at(-1) ?? '', /not the model's decoding speed/u);
    await session.prompt(`/dock-config ${JSON.stringify(config)}`);
    assert.match(capture.render().map(stripVTControlCharacters).join('\n'), /★ Details/u);
    await session.prompt('/dock-info custom');
    assert.match(capture.notifications.at(-1) ?? '', /Custom explanation/u);
    await session.prompt('/dock-action vendor-details');
    await session.prompt('/dock-context');
    const invocations = session.sessionManager
      .getEntries()
      .filter(
        (entry) => entry.type === 'custom' && entry.customType === 'fixture-dynamic-invocation',
      );
    assert.equal(invocations.length, 2);
    const rebound = await captureFooter(session);
    try {
      assert.match(rebound.render().map(stripVTControlCharacters).join('\n'), /★ Details/u);
      await session.prompt('/dock-action vendor-details');
      assert.equal(
        session.sessionManager
          .getEntries()
          .filter(
            (entry) => entry.type === 'custom' && entry.customType === 'fixture-dynamic-invocation',
          ).length,
        3,
      );
      await session.prompt('/dock-config {"rows":[]}');
      assert.match(rebound.notifications.at(-1) ?? '', /Nothing changed/u);
      assert.match(rebound.render().map(stripVTControlCharacters).join('\n'), /★ Details/u);
      await session.prompt('/dock-config reset');
      assert.doesNotMatch(rebound.render().map(stripVTControlCharacters).join('\n'), /★ Details/u);
      assert.deepEqual(rebound.errors, []);
    } finally {
      rebound.dispose();
    }
    assert.deepEqual(capture.errors, []);
  } finally {
    capture.dispose();
    session.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
