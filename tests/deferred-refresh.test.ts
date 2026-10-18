import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { DeferredRefresh } from '../src/adapters/deferred-refresh.js';
import { readTotals } from '../src/adapters/snapshot.js';
import { assistantEntry, providerModels } from './fixtures.js';

await test('message-end refresh reads persisted usage, not the pre-persistence zero snapshot', async () => {
  const model = providerModels[0];
  assert.ok(model);
  const session = SessionManager.inMemory();
  const refresh = new DeferredRefresh();
  let totals = readTotals(session.getEntries());
  refresh.schedule(() => {
    totals = readTotals(session.getEntries());
  });
  assert.equal(totals.input, 0);
  session.appendMessage(assistantEntry(model).message);
  await setImmediate();
  assert.deepEqual(totals, { input: 1_500, output: 250, cacheRead: 500, cacheWrite: 0, cost: 0 });
});

await test('refreshes coalesce to the latest callback; cleanup cancels pending updates', async () => {
  const refresh = new DeferredRefresh();
  const observed: string[] = [];
  refresh.schedule(() => {
    observed.push('old');
  });
  refresh.schedule(() => {
    observed.push('latest');
  });
  await setImmediate();
  assert.deepEqual(observed, ['latest']);
  refresh.schedule(() => {
    observed.push('after-shutdown');
  });
  refresh.cancel();
  refresh.cancel();
  await setImmediate();
  assert.deepEqual(observed, ['latest']);
});
