import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { watch } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { GitMonitor } from '../src/adapters/git-monitor.js';
import type { GitState } from '../src/core/model.js';
import { unknownGit } from '../src/adapters/git.js';
import { createGitRepository, waitForGit } from './support/git-fixtures.js';

const clean: GitState = { branch: 'main', changed: 0, ahead: 0 };

await test('Git source failure is unknown, stays quiescent, and recovers only on a new hint', async () => {
  const f = await createGitRepository();
  let calls = 0;
  let latest: GitState | undefined;
  const monitor = new GitMonitor(
    f.cwd,
    (value) => {
      latest = value;
    },
    {
      read: () => {
        calls += 1;
        if (calls === 1) throw new Error('fixture failure');
        return Promise.resolve(clean);
      },
    },
  );
  try {
    await waitForGit(() => latest?.monitoring === 'unavailable' && !monitor.stats().busy);
    assert.deepEqual(latest, { ...unknownGit, monitoring: 'unavailable' });
    assert.equal(monitor.stats().failure, 'source-unavailable');
    await delay(80);
    assert.equal(calls, 1);
    monitor.request();
    await waitForGit(() => latest?.branch === 'main');
    assert.equal(latest.monitoring, undefined);
  } finally {
    monitor.dispose();
    await f.close();
  }
});

await test('Git consumer failure cannot leak rejection and can be retried by the next real hint', async () => {
  const f = await createGitRepository();
  let deliveries = 0;
  const monitor = new GitMonitor(
    f.cwd,
    () => {
      deliveries += 1;
      if (deliveries === 1) throw new Error('fixture subscriber failure');
    },
    {
      read: () => Promise.resolve(clean),
    },
  );
  try {
    await waitForGit(() => monitor.stats().consumerErrors === 1 && !monitor.stats().busy);
    monitor.request();
    await waitForGit(() => deliveries === 2 && !monitor.stats().busy);
    assert.equal(monitor.stats().health, 'ready');
  } finally {
    monitor.dispose();
    await f.close();
  }
});

await test('watch failure invalidates without self-retry; a later explicit hint rebuilds coverage', async () => {
  const f = await createGitRepository();
  let inject = true;
  const monitor = new GitMonitor(f.cwd, () => undefined, {
    watch: (path, listener) => {
      if (!inject) return watch(path, { persistent: false, encoding: 'utf8' }, listener);
      inject = false;
      const fake = Object.assign(new EventEmitter(), { close: () => undefined });
      queueMicrotask(() => {
        fake.emit('error', new Error('fixture watcher failure'));
      });
      return fake;
    },
  });
  try {
    await waitForGit(() => monitor.stats().health === 'unavailable' && !monitor.stats().busy);
    assert.equal(monitor.stats().errors, 1);
    assert.equal(monitor.stats().failure, 'watcher-error');
    const cycles = monitor.stats().cycles;
    await delay(80);
    assert.equal(monitor.stats().cycles, cycles);
    monitor.request(true);
    await waitForGit(() => monitor.stats().health === 'ready');
  } finally {
    monitor.dispose();
    await f.close();
  }
});

await test('watch exhaustion switches to events mode: real values, no watchers, no polling', async () => {
  const f = await createGitRepository();
  let latest: GitState | undefined;
  let reads = 0;
  const monitor = new GitMonitor(
    f.cwd,
    (value) => {
      latest = value;
    },
    {
      maxWatches: 2,
      read: () => {
        reads += 1;
        return Promise.resolve(clean);
      },
    },
  );
  try {
    await waitForGit(() => monitor.stats().health === 'ready' && !monitor.stats().busy);
    assert.deepEqual(latest, { ...clean, monitoring: 'events' });
    assert.equal(monitor.stats().watchers, 0);
    assert.equal(monitor.stats().failure, 'watch-budget');
    assert.equal(monitor.stats().mode, 'events');
    const cycles = monitor.stats().cycles;
    await delay(80);
    assert.equal(monitor.stats().cycles, cycles, 'nothing reads on its own');
    monitor.request();
    await waitForGit(() => reads === 2 && !monitor.stats().busy);
    monitor.request(true);
    await waitForGit(() => reads === 3 && !monitor.stats().busy);
    assert.equal(monitor.stats().watchers, 0, 'a topology hint does not try to watch again');
  } finally {
    monitor.dispose();
    await f.close();
  }
});

await test('the operating system refusing a watcher (inotify limit) is also events mode, not unavailable', async () => {
  const f = await createGitRepository();
  let latest: GitState | undefined;
  const monitor = new GitMonitor(
    f.cwd,
    (value) => {
      latest = value;
    },
    {
      read: () => Promise.resolve(clean),
      watch: () => {
        throw Object.assign(new Error('ENOSPC: no space left on device, watch'), {
          code: 'ENOSPC',
        });
      },
    },
  );
  try {
    await waitForGit(() => monitor.stats().health === 'ready' && !monitor.stats().busy);
    assert.deepEqual(latest, { ...clean, monitoring: 'events' });
    assert.equal(monitor.stats().failure, 'watcher-unavailable');
  } finally {
    monitor.dispose();
    await f.close();
  }
});
