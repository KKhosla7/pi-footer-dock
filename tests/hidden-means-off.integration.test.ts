import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test } from 'node:test';
import { stripVTControlCharacters } from 'node:util';
import { rollupPath } from '../src/adapters/history/tracker.js';
import { saveSettings } from '../src/adapters/settings-file.js';
import { parseSettings } from '../src/core/settings.js';
import { createGitRepository } from './support/git-fixtures.js';
import { captureFooter, createStreamingSession } from './support/sdk-session.js';

const SETTLE_MS = 1800;

const HIDDEN = { hideAt: 'xl' } as const;
const writeSettings = (slots: Record<string, unknown>): void => {
  saveSettings(parseSettings({ version: 1, slots }));
};
const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

async function observe(
  hidden: string[],
): Promise<{ gitCalls: string[]; rollup: boolean; text: string }> {
  writeSettings(Object.fromEntries(hidden.map((id) => [id, HIDDEN])));
  rmSync(rollupPath(), { force: true });
  const repo = await createGitRepository();
  const shims = mkdtempSync(join(tmpdir(), 'dock-shim-'));
  const log = join(shims, 'calls.log');
  const real = execFileSync('which', ['git'], { encoding: 'utf8' }).trim();
  writeFileSync(log, '');
  writeFileSync(join(shims, 'git'), `#!/bin/sh\necho "$*" >> "${log}"\nexec "${real}" "$@"\n`);
  chmodSync(join(shims, 'git'), 0o755);
  const path = process.env.PATH;
  process.env.PATH = `${shims}${delimiter}${path ?? ''}`;
  try {
    const { session } = await createStreamingSession(repo.cwd, 'http://127.0.0.1:1');
    const capture = await captureFooter(session);
    await pause(SETTLE_MS);
    const gitCalls = readFileSync(log, 'utf8').split('\n').filter(Boolean);
    const rollup = existsSync(rollupPath());
    const text = capture.render().map(stripVTControlCharacters).join('\n');
    capture.dispose();
    session.dispose();
    return { gitCalls, rollup, text };
  } finally {
    if (path === undefined) delete process.env.PATH;
    else process.env.PATH = path;
    await repo.close();
    rmSync(shims, { recursive: true, force: true });
  }
}

await test('control: with every item shown, Git is read and the cost history is scanned', async () => {
  const seen = await observe([]);
  assert.ok(seen.gitCalls.length > 0, 'the git shim saw no call: the observation does not work');
  assert.ok(seen.rollup, 'no rollup file: the observation of the history scan does not work');
  assert.match(seen.text, /\bmain\b/u, 'the branch is not shown: the fixture does not show Git');
});

await test(
  'hidden means off: with every Git item hidden, no git process runs',
  { todo: 'sources start only on demand' },
  async () => {
    const seen = await observe(['branch', 'changes', 'ahead']);
    assert.doesNotMatch(
      seen.text,
      /\bmain\b/u,
      'the branch is still shown: the items are not hidden',
    );
    assert.deepEqual(seen.gitCalls, []);
  },
);

await test(
  'hidden means off: with the cost item hidden, the cost history is not scanned',
  { todo: 'sources start only on demand' },
  async () => {
    const seen = await observe(['cost']);
    assert.equal(seen.rollup, false);
  },
);
