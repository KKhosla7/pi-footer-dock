import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

const agent = mkdtempSync(join(tmpdir(), 'dock-legacy-'));
process.env.PI_CODING_AGENT_DIR = agent;
const { loadSettings, saveSettings, settingsPath } =
  await import('../src/adapters/settings-file.js');
const { NAMES } = await import('../src/core/product.js');

await test('settings saved under the development name are still read, and the next save uses the new name', () => {
  assert.equal(settingsPath(), join(agent, 'pi-footer-dock.json'));
  assert.deepEqual(NAMES.legacySettingsFiles, ['pi-telltale.json', 'pi-glance.json']);
  const oldest = NAMES.legacySettingsFiles[1];
  assert.ok(oldest);
  writeFileSync(
    join(agent, oldest),
    JSON.stringify({ version: 1, glyphs: 'portable', slots: {} }),
    { mode: 0o600 },
  );
  const loaded = loadSettings();
  assert.equal(loaded.problem, undefined);
  assert.equal(loaded.settings.glyphs, 'portable');
  saveSettings({ ...loaded.settings, glyphs: 'nerd' });
  assert.ok(readdirSync(agent).includes('pi-footer-dock.json'));
  assert.equal(
    loadSettings().settings.glyphs,
    'nerd',
    'the new file wins over the old one from now on',
  );
});

await test('the names written are the public ones; the old ones are only ever read', () => {
  assert.equal(NAMES.configEntry, 'pi-footer-dock-config-v1');
  assert.equal(NAMES.limitsEntry, 'pi-footer-dock-rate-limits-v1');
  assert.equal(NAMES.traceChannel, 'pi-footer-dock:interaction-trace:v1');
  assert.equal(NAMES.pointerDebugEnv, 'PI_FOOTER_DOCK_POINTER_DEBUG');
  for (const name of [
    NAMES.configEntry,
    NAMES.limitsEntry,
    NAMES.traceChannel,
    NAMES.settingsFile,
    NAMES.cacheDir,
  ])
    assert.doesNotMatch(name, /glance|telltale/u);
});
