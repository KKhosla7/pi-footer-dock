import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { GitMonitor } from '../src/adapters/git-monitor.js';
import type { GitState } from '../src/core/model.js';
import { createGitRepository, waitForGit } from './support/git-fixtures.js';
import { captureFooter, createStreamingSession } from './support/sdk-session.js';
import { startTimedProvider } from './support/timed-provider-server.js';

async function loadedGitFooter(baseUrl = 'http://127.0.0.1:1') {
  const repo = await createGitRepository();
  const { session } = await createStreamingSession(repo.cwd, baseUrl);
  const capture = await captureFooter(session);
  const text = () => capture.render().map(stripVTControlCharacters).join('\n');
  await waitForGit(() => text().includes('0 files') && text().includes('0 ahead'));
  return {
    ...repo,
    session,
    capture,
    text,
    close: async () => {
      capture.dispose();
      session.dispose();
      await repo.close();
    },
  };
}

await test('loaded footer observes external nested files, staging, commits and local push without manual refresh', async () => {
  const f = await loadedGitFooter();
  try {
    await mkdir(join(f.cwd, 'nested'));
    await writeFile(join(f.cwd, 'nested/new.txt'), 'fixture\n');
    await writeFile(join(f.cwd, 'nested/skip.ignored'), 'ignored\n');
    await waitForGit(() => f.text().includes('1 file'));
    assert.match(f.text(), /0 ahead/u);
    await f.git('add', '.');
    await writeFile(join(f.cwd, 'nested/new.txt'), 'staged and unstaged\n');
    await waitForGit(() => f.text().includes('1 file'));
    await f.git('add', '.');
    await f.git('commit', '-m', 'fixture changed');
    await waitForGit(() => f.text().includes('0 files') && f.text().includes('1 ahead'));
    await f.git('push');
    await waitForGit(() => f.text().includes('0 ahead'));
    assert.deepEqual(f.capture.errors, []);
    assert.equal(f.session.getSessionStats().totalMessages, 0);
  } finally {
    await f.close();
  }
});

await test('loaded footer observes file creation during a native run before agent_end and preserves usage accounting', async () => {
  const server = await startTimedProvider({ headerDelayMs: 15_000 });
  const f = await loadedGitFooter(server.baseUrl);
  let pending: Promise<void> | undefined;
  try {
    pending = f.session.prompt('Synthetic held response, no tools.');
    await waitForGit(() => server.requests() === 1);
    assert.equal(f.session.isStreaming, true);
    await writeFile(join(f.cwd, 'during-run.txt'), 'fixture\n');
    await waitForGit(() => f.text().includes('1 file'));
    assert.equal(f.session.isStreaming, true, 'Git must update before run completion');
    assert.equal(server.requests(), 1, 'Git refresh must not start inference');
    assert.deepEqual(f.capture.errors, []);
  } finally {
    await f.session.abort();
    await pending;
    await f.close();
    await server.close();
  }
});

await test('linked worktree subdirectory and upstream replacement reconcile independently of branch-name callbacks', async () => {
  const f = await createGitRepository();
  const linked = join(f.root, 'linked');
  let state: GitState | undefined;
  let monitor: GitMonitor | undefined;
  try {
    await f.git('worktree', 'add', '-b', 'linked', linked, 'main');
    await mkdir(join(linked, 'deep'));
    monitor = new GitMonitor(join(linked, 'deep'), (value) => {
      state = value;
    });
    await waitForGit(() => state?.branch === 'linked');
    assert.equal(state?.ahead, null);
    await writeFile(join(linked, 'new.txt'), 'fixture\n');
    await waitForGit(() => state?.changed === 1);
    await f.git('-C', linked, 'branch', '--set-upstream-to=origin/main');
    await waitForGit(() => state?.ahead === 0);
    await f.git('-C', linked, 'branch', '--unset-upstream');
    await waitForGit(() => state?.ahead === null);
  } finally {
    monitor?.dispose();
    await f.close();
  }
});

await test('loaded footer retains compact custom count templates, gaps and updates after remount', async () => {
  const f = await loadedGitFooter();
  let rebound: Awaited<ReturnType<typeof captureFooter>> | undefined;
  try {
    await f.session.prompt(
      '/dock-config {"slots":{"changes":{"icon":"F","text":"{icon} {changes}","gap":1},"ahead":{"icon":"A","text":"{icon} {ahead}","gap":1}}}',
    );
    assert.match(f.text(), /F 0 A 0/u);
    await writeFile(join(f.cwd, 'new.txt'), 'fixture\n');
    await waitForGit(() => f.text().includes('F 1 A 0'));
    rebound = await captureFooter(f.session);
    const nextText = () => rebound?.render().map(stripVTControlCharacters).join('\n') ?? '';
    await waitForGit(() => nextText().includes('F 1 A 0'));
    await unlink(join(f.cwd, 'new.txt'));
    await waitForGit(() => nextText().includes('F 0 A 0'));
    assert.deepEqual(rebound.errors, []);
  } finally {
    rebound?.dispose();
    await f.close();
  }
});
