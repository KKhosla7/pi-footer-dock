import assert from 'node:assert/strict';
import { chmod, link, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { loadSettings, saveSettings } from '../src/adapters/settings-file.js';
import { defaultSettings } from '../src/core/settings.js';
import type { Settings } from '../src/core/settings.js';

const settings: Settings = { version: 1, glyphs: 'portable', slots: { cache: { hideAt: 'md' } } };
async function inTemporaryDirectory(run: (directory: string) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'dock-settings-'));
  try {
    await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

await test('a missing file means defaults, with nothing to report', async () => {
  await inTemporaryDirectory((directory) => {
    assert.deepEqual(loadSettings(join(directory, 'none.json')), { settings: defaultSettings() });
    return Promise.resolve();
  });
});

await test('saving writes a private file that loads back, and leaves no temporary file', async () => {
  await inTemporaryDirectory(async (directory) => {
    const file = join(directory, 's.json');
    saveSettings(settings, file);
    assert.deepEqual(loadSettings(file), { settings });
    assert.equal(((await import('node:fs')).statSync(file).mode & 0o777).toString(8), '600');
    assert.deepEqual(await readdir(directory), ['s.json']);
    saveSettings(defaultSettings(), file);
    assert.deepEqual(loadSettings(file).settings, defaultSettings());
  });
});

await test('a failed save keeps the previous file and cleans up', async () => {
  await inTemporaryDirectory(async (directory) => {
    const file = join(directory, 's.json');
    saveSettings(settings, file);
    const circular: Settings = { version: 1, slots: {} };
    (circular as unknown as Record<string, unknown>).self = circular;
    assert.throws(() => {
      saveSettings(circular, file);
    });
    assert.deepEqual(loadSettings(file), { settings });
    assert.deepEqual(await readdir(directory), ['s.json']);
  });
});

await test('unsafe or invalid files are ignored with a reason, never thrown', async () => {
  await inTemporaryDirectory(async (directory) => {
    const good = join(directory, 'good.json');
    saveSettings(settings, good);
    const cases: [string, () => Promise<string>][] = [
      [
        'invalid json',
        async () => {
          const f = join(directory, 'a.json');
          await writeFile(f, '{nope', { mode: 0o600 });
          return f;
        },
      ],
      [
        'invalid schema',
        async () => {
          const f = join(directory, 'b.json');
          await writeFile(f, '{"version":1,"x":1}', { mode: 0o600 });
          return f;
        },
      ],
      [
        'too large',
        async () => {
          const f = join(directory, 'c.json');
          await writeFile(f, ' '.repeat(20_000), { mode: 0o600 });
          return f;
        },
      ],
      [
        'group readable',
        async () => {
          const f = join(directory, 'd.json');
          await writeFile(f, await readFile(good), { mode: 0o600 });
          await chmod(f, 0o640);
          return f;
        },
      ],
      [
        'symlink',
        async () => {
          const f = join(directory, 'e.json');
          await symlink(good, f);
          return f;
        },
      ],
      [
        'hard link',
        async () => {
          const f = join(directory, 'f.json');
          await link(good, f);
          return f;
        },
      ],
      ['directory', () => Promise.resolve(directory)],
    ];
    for (const [name, make] of cases) {
      const result = loadSettings(await make());
      assert.deepEqual(result.settings, defaultSettings(), name);
      assert.ok(result.problem, `${name} is reported`);
    }
  });
});
