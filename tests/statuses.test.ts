import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { test } from 'node:test';
import { visibleWidth } from '@earendil-works/pi-tui';
import { cleanStatus, statusLine } from '../src/ui/statuses.js';
import { startProviderServer } from './support/provider-server.js';
import { captureFooter, createStreamingSession } from './support/sdk-session.js';

await test('status text: whitespace collapses, colours stay, every other escape and control character goes', () => {
  assert.equal(cleanStatus('  a\n\tb   c  '), 'a b c');
  assert.equal(cleanStatus('\u001b[32mgreen\u001b[0m ok'), '\u001b[32mgreen\u001b[0m ok');
  assert.equal(cleanStatus('x\u001b[2J\u001b[1;1Hy'), 'xy', 'screen clearing and cursor moves');
  assert.equal(cleanStatus('\u001b]0;new title\u0007visible'), 'visible', 'window title');
  assert.equal(
    cleanStatus('\u001b]8;;http://example.test\u0007link\u001b]8;;\u0007'),
    'link',
    'hyperlinks',
  );
  assert.equal(cleanStatus('a\u0000b\u0007c\u009bd'), 'abcd');
  assert.equal(cleanStatus('half\u001b'), 'half');
  assert.equal(cleanStatus('\u001b[31'), '31', 'a broken sequence is only text');
});

await test('the status line: sorted by key, one space between, cut to the width, absent when empty', () => {
  assert.equal(statusLine(new Map(), 80), undefined);
  assert.equal(
    statusLine(
      new Map([
        ['b', 'second'],
        ['a', 'first'],
        ['c', '   '],
      ]),
      80,
    ),
    'first second',
  );
  const long = statusLine(new Map([['a', 'x'.repeat(200)]]), 40) ?? '';
  assert.ok(visibleWidth(long) <= 40);
  assert.ok(stripVTControlCharacters(long).endsWith('…'));
});

await test('in a real Pi session, a status another extension set is shown on a last line', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-status-'));
  const server = await startProviderServer();
  const { session } = await createStreamingSession(directory, server.baseUrl);
  const statuses = new Map<string, string>();
  const capture = await captureFooter(session, statuses);
  try {
    const before = capture.render(200).length;
    statuses.set('zz-other', 'other: 3 queued');
    statuses.set('aa-first', '\u001b[2Jfirst');
    const lines = capture.render(200).map(stripVTControlCharacters);
    assert.equal(lines.length, before + 1, 'one extra line, only while a status exists');
    assert.equal(lines.at(-1)?.trim(), 'first other: 3 queued');
    statuses.clear();
    assert.equal(capture.render(200).length, before, 'and it goes away again');
    assert.deepEqual(capture.errors, []);
  } finally {
    capture.dispose();
    session.dispose();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
