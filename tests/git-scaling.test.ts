import assert from 'node:assert/strict';
import { test } from 'node:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Throttle } from '../src/adapters/git-coverage.js';
import { GitMonitor } from '../src/adapters/git-monitor.js';
import { createGitRepository, waitForGit } from './support/git-fixtures.js';

await test('the throttle lets the first start through, defers the rest, and asks once more at the end', async () => {
  let asked = 0;
  const throttle = new Throttle(60, () => {
    asked += 1;
  });
  assert.equal(throttle.allow(), true, 'the first one runs at once');
  for (let burst = 0; burst < 20; burst += 1) assert.equal(throttle.allow(), false);
  assert.equal(throttle.waiting, true);
  await delay(120);
  assert.equal(asked, 1, 'one trailing request, however many were deferred');
  assert.equal(throttle.waiting, false);
  assert.equal(throttle.allow(), true, 'after the interval the next start runs');
  throttle.stop();
});

await test('a burst of file creations causes few rescans and few Git reads, and the last one is not lost', async () => {
  const f = await createGitRepository();
  let reads = 0;
  const monitor = new GitMonitor(f.cwd, () => undefined, {
    topologyIntervalMs: 150,
    readIntervalMs: 50,
    read: () => {
      reads += 1;
      return Promise.resolve({ branch: 'main', changed: 0, ahead: 0 });
    },
  });
  try {
    await waitForGit(() => monitor.stats().health === 'ready' && !monitor.stats().busy);
    const before = monitor.stats().rescans;
    for (let index = 0; index < 30; index += 1) {
      await writeFile(join(f.cwd, `burst-${index}.txt`), 'x');
      await delay(5);
    }
    await delay(400);
    await waitForGit(() => !monitor.stats().busy);
    const rescans = monitor.stats().rescans - before;
    assert.ok(rescans >= 1, 'the burst was noticed: a trailing rescan ran');
    assert.ok(rescans <= 4, `${rescans} topology rescans for 30 creations in ~200 ms`);
    assert.ok(reads >= 2, 'a trailing read ran');
    assert.ok(
      reads <= 20,
      `${reads} Git reads for 30 creations in ~200 ms (one per 50 ms at most)`,
    );
  } finally {
    monitor.dispose();
    await f.close();
  }
});

await test('disposing the monitor clears the rate-limit timer', async () => {
  const f = await createGitRepository();
  const monitor = new GitMonitor(f.cwd, () => undefined, {
    topologyIntervalMs: 10_000,
    read: () => Promise.resolve({ branch: 'main', changed: 0, ahead: 0 }),
  });
  await waitForGit(() => monitor.stats().health === 'ready' && !monitor.stats().busy);
  monitor.request(true);
  monitor.request(true);
  await delay(30);
  monitor.dispose();
  assert.equal(monitor.stats().busy, false, 'no timer left waiting');
  await f.close();
});
