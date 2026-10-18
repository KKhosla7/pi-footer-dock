import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { discoverAndLoadExtensions } from '@earendil-works/pi-coding-agent';

await test('Pi loads the TypeScript entrypoint with all commands (no model call or global config)', async () => {
  const isolated = await mkdtemp(join(tmpdir(), 'pi-footer-dock-loader-'));
  try {
    const result = await discoverAndLoadExtensions([resolve('src/index.ts')], isolated, isolated);
    assert.deepEqual(result.errors, []);
    assert.equal(result.extensions.length, 1);
    const extension = result.extensions[0];
    assert.ok(extension);
    assert.deepEqual([...extension.commands.keys()].sort(), [
      'dock-action',
      'dock-config',
      'dock-context',
      'dock-debug',
      'dock-glyphs',
      'dock-info',
      'dock-open',
      'dock-open-with',
      'dock-pointer-debug',
      'dock-quota',
      'dock-refresh',
      'dock-settings',
    ]);
    assert.ok(extension.handlers.has('session_start'));
    assert.ok(extension.handlers.has('session_shutdown'));
  } finally {
    await rm(isolated, { recursive: true, force: true });
  }
});
