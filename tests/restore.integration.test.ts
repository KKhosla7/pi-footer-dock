import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { startTimedProvider } from './support/timed-provider-server.js';
import { captureFooter, createStreamingSession } from './support/sdk-session.js';
import { waitForGit } from './support/git-fixtures.js';

await test('streamed response survives persisted session reopen and footer rebind/refresh', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-restore-'));
  const server = await startTimedProvider();
  const manager = SessionManager.create(directory, join(directory, 'sessions'));
  const first = await createStreamingSession(directory, server.baseUrl, manager);
  const originalFooter = await captureFooter(first.session);
  try {
    await first.session.prompt('Produce a real streamed response for restoration.');
    const path = manager.getSessionFile();
    assert.ok(path);
    const restored = await createStreamingSession(
      directory,
      server.baseUrl,
      SessionManager.open(path),
    );
    const restoredFooter = await captureFooter(restored.session);
    try {
      // Compare settled frames, not a newly bound frame still awaiting its initial I/O: the folder
      // has no Git, so settled means both footers drew the same thing for about 300 ms.
      let steady = 0;
      let previous = '';
      await waitForGit(() => {
        const now = originalFooter.render().join('\n') + restoredFooter.render().join('\n');
        steady = now === previous ? steady + 1 : 0;
        previous = now;
        return steady >= 30;
      });
      const original = originalFooter.render().map(stripVTControlCharacters).join('\n');
      assert.match(original, /\uf0e4 \d+\.\d+ tok\/s/u);
      // Latest live-turn telemetry is deliberately cleared on reopen; totals/layout restore.
      const expected = original
        .replace(/ {3}\uf0e4 \d+\.\d+ tok\/s/gu, (text) => ' '.repeat(text.length))
        .replace(/\uf021 last [\d.%<>]+ · \S+ read/u, (text) =>
          '\uf021 cache pending'.padEnd(text.length),
        );
      const reopened = restoredFooter.render().map(stripVTControlCharacters).join('\n');
      assert.doesNotMatch(reopened, /tok\/s/u);
      assert.equal(reopened, expected);
      assert.match(expected, /↑ 900.*↓ 25.*cache pending/u);
      await restored.session.prompt('/dock-info cache');
      assert.match(restoredFooter.notifications.at(-1) ?? '', /200 read of /u);
      await restored.session.prompt('/dock-refresh');
      assert.equal(restoredFooter.render().map(stripVTControlCharacters).join('\n'), expected);
      assert.equal(
        restored.session.getContextUsage()?.tokens,
        first.session.getContextUsage()?.tokens,
      );
      assert.deepEqual(restoredFooter.errors, []);
    } finally {
      restoredFooter.dispose();
      restored.session.dispose();
    }
  } finally {
    originalFooter.dispose();
    first.session.dispose();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
