import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { stripVTControlCharacters } from 'node:util';
import { test } from 'node:test';
import { startTimedProvider } from './support/timed-provider-server.js';
import { captureFooter, createStreamingSession } from './support/sdk-session.js';
import { Sessions } from './support/history-fixture.js';

async function until(read: () => string, pattern: RegExp): Promise<string> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const text = read();
    if (pattern.test(text)) return text;
    await delay(25);
  }
  return read();
}

await test('the footer cost is the month across sessions once the history is read, and follows the setting', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-history-footer-'));
  const server = await startTimedProvider({ prompt: 100, read: 0 });
  const agent = process.env.PI_CODING_AGENT_DIR ?? '';
  const sessions = join(agent, 'sessions');
  await mkdir(sessions, { recursive: true });
  // Two earlier sessions, written minutes ago by Pi's own session manager.
  const past = new Sessions(Date.now() - 600_000, sessions);
  const cwd = past.folder('earlier');
  past.log(cwd, 'earlier-a', [{ input: 10, read: 0, output: 1, total: 3 }]);
  past.log(cwd, 'earlier-b', [{ input: 10, read: 0, output: 1, total: 4.25 }]);
  const { session } = await createStreamingSession(directory, server.baseUrl);
  const capture = await captureFooter(session);
  const render = () => capture.render(200).map(stripVTControlCharacters).join('\n');
  try {
    await session.prompt(
      '/dock-config {"rows":[{"left":["model"],"right":[]},{"left":["cost"],"right":[]}]}',
    );
    const month = await until(render, /≈\$7\.25 mo/u);
    assert.match(month, /≈\$7\.25 mo/u, 'both earlier sessions, in the month');
    await session.prompt(
      '/dock-config {"rows":[{"left":["model"],"right":[]},{"left":["cost"],"right":[]}],"slots":{"cost":{"period":"day"}}}',
    );
    assert.match(await until(render, /≈\$7\.25 day/u), /≈\$7\.25 day/u);
    await session.prompt(
      '/dock-config {"rows":[{"left":["model"],"right":[]},{"left":["cost"],"right":[]}],"slots":{"cost":{"period":"session"}}}',
    );
    assert.doesNotMatch(
      render(),
      /≈\$/u,
      'this session has cost nothing yet, and says so by showing nothing',
    );
    assert.deepEqual(capture.errors, []);
  } finally {
    capture.dispose();
    session.dispose();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
