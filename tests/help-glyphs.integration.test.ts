import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { stripVTControlCharacters } from 'node:util';
import { nerdGlyphs, portableGlyphs } from '../src/ui/glyphs.js';
import { captureFooter, createStreamingSession } from './support/sdk-session.js';

async function waitForBranch(render: () => string[], icon: string): Promise<void> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (render().map(stripVTControlCharacters).join('\n').includes(`${icon} main`)) return;
    await setTimeout(25);
  }
  assert.fail(`Footer did not render ${icon} main`);
}

await test('help uses the rendered glyph set after Nerd/portable toggles and respects custom icons', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-help-glyphs-'));
  execFileSync('git', ['init', '--initial-branch=main', '--quiet'], { cwd: directory });
  const { session } = await createStreamingSession(directory, 'http://127.0.0.1:1');
  const capture = await captureFooter(session);
  try {
    for (const glyphs of [nerdGlyphs, portableGlyphs, nerdGlyphs]) {
      await waitForBranch(capture.render, glyphs.branch);
      await session.prompt('/dock-info branch');
      assert.ok((capture.notifications.at(-1) ?? '').startsWith(`branch: ${glyphs.branch} main\n`));
      await session.prompt('/dock-info model');
      assert.ok((capture.notifications.at(-1) ?? '').startsWith(`model: ${glyphs.robot} `));
      await session.prompt('/dock-glyphs');
    }
    await session.prompt('/dock-config {"slots":{"branch":{"icon":"★"}}}');
    await waitForBranch(capture.render, '★');
    await session.prompt('/dock-info branch');
    assert.ok((capture.notifications.at(-1) ?? '').startsWith('branch: ★ main\n'));
    assert.deepEqual(capture.errors, []);
  } finally {
    capture.dispose();
    session.dispose();
    await rm(directory, { recursive: true, force: true });
  }
});
