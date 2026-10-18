import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import { stripVTControlCharacters } from 'node:util';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { test } from 'node:test';
import { startTimedProvider } from './support/timed-provider-server.js';
import { captureFooter, createStreamingSession } from './support/sdk-session.js';

await test('in a real Pi session, an extension that follows only the document gets its items in the footer', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-ext-e2e-'));
  const server = await startTimedProvider({});
  const { session } = await createStreamingSession(directory, server.baseUrl, undefined, [
    resolve('tests/support/acme-extension.ts'),
  ]);
  const capture = await captureFooter(session);
  try {
    let text = '';
    for (let attempt = 0; attempt < 100 && !text.includes('Acme'); attempt += 1) {
      await delay(25);
      text = capture.render(220).map(stripVTControlCharacters).join('\n');
    }
    assert.match(text, /Acme: 3 jobs running/u);
    assert.match(text, /a third row/u);
    assert.equal(
      capture.render(220).length,
      3,
      "two rows of Footer Dock's own and the third the extension asked for",
    );
    assert.deepEqual(capture.errors, []);
    const rejected = ((globalThis as Record<string, unknown>).__acme as Record<string, unknown[]>)
      .rejected;
    assert.deepEqual(rejected, [], 'a correct registration is not rejected');
  } finally {
    capture.dispose();
    session.dispose();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

await test('no file of Footer Dock names the extensions it serves: it knows nothing about any of them', () => {
  const names = /acme/iu;
  const files: string[] = [];
  const walk = (folder: string): void => {
    for (const entry of readdirSync(folder)) {
      const path = join(folder, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (path.endsWith('.ts')) files.push(path);
    }
  };
  walk(resolve('src'));
  assert.ok(files.length > 100);
  for (const file of files) assert.doesNotMatch(readFileSync(file, 'utf8'), names, file);
});
