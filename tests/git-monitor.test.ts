import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { GitMonitor } from '../src/adapters/git-monitor.js';
import type { GitState } from '../src/core/model.js';
import { createGitRepository, waitForGit } from './support/git-fixtures.js';

const clean: GitState = { branch: 'main', changed: 0, ahead: 0 };

await test('event Git monitor coalesces 10000 hints, preserves active reads and fences late disposal', async () => {
  const f = await createGitRepository();
  const calls: { signal: AbortSignal; complete: (value: GitState) => void }[] = [];
  const values: GitState[] = [];
  const monitor = new GitMonitor(
    f.cwd,
    (value) => {
      values.push(value);
    },
    {
      read: (_cwd, signal) =>
        new Promise((complete) => {
          calls.push({ signal, complete });
        }),
    },
  );
  try {
    await waitForGit(() => calls.length === 1);
    for (let i = 0; i < 10000; i += 1) monitor.request();
    await delay(40);
    assert.equal(calls.length, 1);
    const first = calls[0];
    assert.ok(first);
    assert.equal(first.signal.aborted, false);
    first.complete(clean);
    await waitForGit(() => calls.length === 2);
    const second = calls[1];
    assert.ok(second);
    monitor.dispose();
    assert.equal(second.signal.aborted, true);
    second.complete({ ...clean, changed: 1 });
    monitor.request();
    await waitForGit(() => !monitor.stats().busy);
    assert.equal(calls.length, 2);
    assert.equal(monitor.stats().peakReads, 1);
    assert.equal(monitor.stats().watchers, 0);
    assert.deepEqual(values, [clean]);
  } finally {
    monitor.dispose();
    await f.close();
  }
});

await test('event Git monitor has no idle polling, suppresses duplicates and copies subscriber state', async () => {
  const f = await createGitRepository();
  let publications = 0;
  const monitor = new GitMonitor(
    f.cwd,
    (value) => {
      publications += 1;
      value.changed = 999;
    },
    {
      read: () => Promise.resolve(clean),
    },
  );
  try {
    await waitForGit(() => publications === 1 && !monitor.stats().busy);
    const before = monitor.stats().reads;
    await delay(150);
    assert.equal(monitor.stats().reads, before);
    for (let i = 0; i < 100; i += 1) monitor.request();
    await waitForGit(() => monitor.stats().reads > before && !monitor.stats().busy);
    assert.equal(publications, 1);
    assert.equal(clean.changed, 0);
  } finally {
    monitor.dispose();
    await f.close();
  }
});

await test('replacement Git owner rejects old-cwd completion and delivers the new cwd only', async () => {
  const f = await createGitRepository();
  const nextRepo = await createGitRepository();
  const values: string[] = [];
  let finish: ((value: GitState) => void) | undefined;
  const old = new GitMonitor(
    f.cwd,
    () => {
      values.push('old');
    },
    {
      read: () =>
        new Promise((complete) => {
          finish = complete;
        }),
    },
  );
  await waitForGit(() => finish !== undefined);
  old.dispose();
  const next = new GitMonitor(
    nextRepo.cwd,
    () => {
      values.push('new');
    },
    {
      read: (cwd) => {
        assert.equal(cwd, nextRepo.cwd);
        return Promise.resolve(clean);
      },
    },
  );
  try {
    finish?.(clean);
    await waitForGit(() => values.length > 0);
    assert.deepEqual(values, ['new']);
    assert.equal(old.stats().watchers, 0);
  } finally {
    old.dispose();
    next.dispose();
    await f.close();
    await nextRepo.close();
  }
});

await test('completed Git snapshots publish during sustained topology invalidation, not only after quiet', async () => {
  const f = await createGitRepository();
  const observed: (number | null)[] = [];
  let calls = 0;
  const monitor = new GitMonitor(
    f.cwd,
    (value) => {
      observed.push(value.changed);
    },
    {
      topologyIntervalMs: 0,
      read: () => {
        calls += 1;
        if (calls < 4) monitor.request(true);
        return Promise.resolve({ ...clean, changed: calls });
      },
    },
  );
  try {
    await waitForGit(() => calls >= 4 && !monitor.stats().busy);
    assert.deepEqual(observed, [1, 2, 3, 4]);
    assert.equal(monitor.stats().peakReads, 1);
  } finally {
    monitor.dispose();
    await f.close();
  }
});

await test('event Git monitor rejects invalid budgets before allocating subscriptions', () => {
  for (const value of [0, -1, NaN, Infinity, 0.5]) {
    assert.throws(
      () => new GitMonitor('/fixture', () => undefined, { maxWatches: value }),
      RangeError,
    );
    assert.throws(
      () => new GitMonitor('/fixture', () => undefined, { maxEntries: value }),
      RangeError,
    );
  }
});
