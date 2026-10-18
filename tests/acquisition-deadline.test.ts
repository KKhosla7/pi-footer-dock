import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getEventListeners } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import {
  AcquisitionCancelledError,
  AcquisitionDeadlineError,
  MAX_ACQUISITION_MS,
  withAcquisitionDeadline,
} from '../src/adapters/acquisition-deadline.js';

await test('acquisition deadlines bound an unresolved resolver and abort cooperative work', async () => {
  let signal: AbortSignal | undefined;
  await assert.rejects(
    withAcquisitionDeadline((incoming) => {
      signal = incoming;
      return new Promise<never>(() => {
        /* Deliberately unresolved public auth resolver. */
      });
    }, 15),
    AcquisitionDeadlineError,
  );
  assert.ok(signal?.aborted);
});

await test('late auth completion cannot initiate transport after the acquisition timed out', async () => {
  let resolveAuth: (() => void) | undefined;
  const auth = new Promise<void>((resolve) => {
    resolveAuth = resolve;
  });
  let requests = 0;
  const acquisition = withAcquisitionDeadline(async (signal) => {
    await auth;
    signal.throwIfAborted();
    requests += 1;
  }, 15);
  await assert.rejects(acquisition, AcquisitionDeadlineError);
  resolveAuth?.();
  await delay(5);
  assert.equal(requests, 0);
});

await test('caller cancellation prevents pre-aborted work and cleans up signal listeners', async () => {
  const caller = new AbortController();
  const before = getEventListeners(caller.signal, 'abort').length;
  assert.equal(await withAcquisitionDeadline(() => Promise.resolve(42), 1000, caller.signal), 42);
  assert.equal(getEventListeners(caller.signal, 'abort').length, before);
  const pending = withAcquisitionDeadline(
    () =>
      new Promise<never>(() => {
        /* Await caller cancellation. */
      }),
    1000,
    caller.signal,
  );
  caller.abort();
  await assert.rejects(pending, AcquisitionCancelledError);
  assert.equal(getEventListeners(caller.signal, 'abort').length, before);
  let called = false;
  await assert.rejects(
    withAcquisitionDeadline(
      () => {
        called = true;
        return Promise.resolve();
      },
      1000,
      caller.signal,
    ),
    AcquisitionCancelledError,
  );
  assert.ok(!called);
});

await test('overdue work cannot beat its delayed timer after an event-loop pause', async () => {
  await assert.rejects(
    withAcquisitionDeadline(() => {
      const until = performance.now() + 30;
      while (performance.now() < until) {
        /* Simulate a blocked event loop. */
      }
      return Promise.resolve('too late');
    }, 5),
    AcquisitionDeadlineError,
  );
  await assert.rejects(withAcquisitionDeadline(() => Promise.resolve(1), 0));
  await assert.rejects(withAcquisitionDeadline(() => Promise.resolve(1), MAX_ACQUISITION_MS + 1));
});
