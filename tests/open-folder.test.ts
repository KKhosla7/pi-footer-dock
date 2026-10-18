import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { join } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { openFolder } from '../src/adapters/folder-opener.js';
import { defaultOpener, launchFor, parseOpenWith, splitCommand } from '../src/core/open-folder.js';
import { quotaRoot } from './support/quota-fixtures.js';

/** A scratch directory the test framework removes afterwards. */
const scratch = (t: TestContext): string => quotaRoot(t);
/** An "app" that records the arguments it was started with, so a test can read them back. */
function recorder(out: string): string[] {
  const code =
    'require("node:fs").writeFileSync(process.argv[1], JSON.stringify(process.argv.slice(2)))';
  return [process.execPath, '-e', code, out, '{path}'];
}
async function recorded(out: string): Promise<string[]> {
  for (let attempt = 0; attempt < 100 && !existsSync(out); attempt += 1) await sleep(50);
  return JSON.parse(readFileSync(out, 'utf8')) as string[];
}

await test('each platform opens a folder with its own file manager', () => {
  assert.equal(defaultOpener('darwin'), 'open');
  assert.equal(defaultOpener('win32'), 'explorer.exe');
  assert.equal(defaultOpener('linux'), 'xdg-open');
  assert.equal(defaultOpener('freebsd'), 'xdg-open');
  assert.deepEqual(launchFor('/p/x y', undefined, 'darwin'), { command: 'open', args: ['/p/x y'] });
  assert.deepEqual(launchFor('C:\\p\\x y', undefined, 'win32'), {
    command: 'explorer.exe',
    args: ['C:\\p\\x y'],
  });
});

await test('a custom command gets the folder at {path}, or as the last argument', () => {
  assert.deepEqual(launchFor('/p', ['code', '{path}'], 'linux'), { command: 'code', args: ['/p'] });
  assert.deepEqual(launchFor('/p', ['thunar'], 'linux'), { command: 'thunar', args: ['/p'] });
  assert.deepEqual(launchFor('/p', ['app', '--dir={path}', '-n', '{path}'], 'linux'), {
    command: 'app',
    args: ['--dir=/p', '-n', '/p'],
  });
  assert.deepEqual(splitCommand('  thunar   {path} '), ['thunar', '{path}']);
});

await test('only a short list of printable arguments is accepted as a command', () => {
  assert.deepEqual(parseOpenWith(['code', '{path}']), ['code', '{path}']);
  for (const bad of [
    undefined,
    'code',
    [],
    [''],
    [1],
    ['a\u001bb'],
    Array.from({ length: 9 }, () => 'x'),
    ['x'.repeat(257)],
  ])
    assert.throws(() => parseOpenWith(bad), Error, JSON.stringify(bad));
});

await test('a folder named with spaces, quotes and shell syntax is one inert argument', async (t) => {
  const root = scratch(t);
  const hostile = join(root, 'a b "q" $(touch PWNED) ; `touch PWNED` && touch PWNED');
  mkdirSync(hostile);
  const out = join(root, 'argv.json');
  assert.deepEqual(await openFolder(hostile, recorder(out)), { ok: true });
  assert.deepEqual(await recorded(out), [hostile], 'exactly the folder, unchanged');
  await sleep(200);
  assert.ok(!existsSync('PWNED') && !existsSync(join(root, 'PWNED')), 'nothing was run by a shell');
});

await test('a command that cannot start is reported with a hint, not thrown', async (t) => {
  const result = await openFolder(scratch(t), ['no-such-app-dock-test', '{path}']);
  assert.ok(!result.ok);
  assert.match(result.message, /no-such-app-dock-test.*\/dock-open-with/u);
});

await test('a missing folder or a plain file never starts anything', async (t) => {
  const root = scratch(t);
  const marker = join(root, 'started');
  const file = join(root, 'a-file');
  writeFileSync(file, 'x');
  const starter = [
    process.execPath,
    '-e',
    `require("node:fs").writeFileSync(${JSON.stringify(marker)}, "1")`,
  ];
  for (const target of [join(root, 'gone'), file]) {
    assert.equal((await openFolder(target, starter)).ok, false);
  }
  await sleep(400);
  assert.ok(!existsSync(marker), 'no process was started');
});
