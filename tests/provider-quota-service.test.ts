import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import {
  CLINE,
  GO,
  KEY,
  clineBody,
  context,
  goBody,
  harness,
  left,
  reply,
  until,
} from './support/provider-quota-harness.js';

await test('ClinePass windows are shown as left, fetched once from the pinned URL with the Pi key', async (t) => {
  const h = harness(t, (_n, clock) => reply(clineBody(clock)));
  const { ctx, calls } = context('clinepass', CLINE);
  h.service().refresh(ctx);
  await until(() => h.last()?.limits !== null && h.last()?.limits !== undefined);
  assert.deepEqual(left(h.last()), [94, 48, 53]);
  assert.deepEqual(
    h.last()?.limits?.windows.map((w) => w.label),
    ['5h', 'week', 'month'],
  );
  assert.equal(h.last()?.status, null);
  assert.equal(h.states[0]?.status, 'quota loading');
  assert.deepEqual(h.fetches, [
    {
      url: 'https://api.cline.bot/api/v1/users/me/plan/usage-limits',
      authorization: `Bearer ${KEY}`,
    },
  ]);
  assert.deepEqual(calls.auth, ['clinepass']);
});

await test('OpenCode Go shows an exhausted monthly cap as 0 left with a rate-limited badge', async (t) => {
  const h = harness(t, (_n, clock) => reply(goBody(clock)));
  h.service().refresh(context('opencode-go', GO).ctx);
  await until(() => h.last()?.limits !== null && h.last()?.limits !== undefined);
  assert.deepEqual(left(h.last()), [100, 100, 0]);
  assert.equal(h.last()?.limits?.windows[2]?.badge, 'rate-limited');
  assert.equal(h.fetches[0]?.url, 'https://opencode.ai/zen/go/v1/usage');
});

await test('two Pi windows share one request; the second reads the shared observation', async (t) => {
  const h = harness(t, (_n, clock) => reply(clineBody(clock)));
  const first = h.service();
  const second = h.service();
  const { ctx } = context('clinepass', CLINE);
  first.refresh(ctx);
  second.refresh(ctx);
  await until(() => h.fetches.length === 1 && h.states.some((s) => s.limits !== null));
  await sleep(50);
  h.advance(3000);
  const before = h.states.length;
  second.refresh(ctx);
  await until(() => h.states.length > before);
  assert.equal(h.fetches.length, 1, 'exactly one request for two windows');
  assert.deepEqual(left(h.last()), [94, 48, 53]);
});

await test('a server backoff is honoured and the polling floor is never undercut', async (t) => {
  const h = harness(t, (n, clock) =>
    n === 1
      ? reply({}, { status: 429, headers: { 'retry-after': '120' } })
      : reply(clineBody(clock)),
  );
  const service = h.service();
  const { ctx } = context('clinepass', CLINE);
  service.refresh(ctx);
  await until(() => h.fetches.length === 1 && service.diagnostics().httpStatus === 429);
  assert.equal(h.last()?.limits, null);
  assert.equal(h.last()?.status, 'quota unavailable');
  h.advance(31_000);
  service.refresh(ctx);
  await sleep(80);
  assert.equal(h.fetches.length, 1, 'Retry-After of 120 s outranks the 30 s interval');
  h.advance(91_000);
  service.refresh(ctx);
  await until(() => h.fetches.length === 2 && h.last()?.limits !== null);
  assert.deepEqual(left(h.last()), [94, 48, 53]);
});

await test('repeated invalid responses back off exponentially', async (t) => {
  const h = harness(t, () => reply({ unexpected: true }));
  const service = h.service();
  const { ctx } = context('opencode-go', GO);
  const step = async (advance: number, expected: number): Promise<void> => {
    h.advance(advance);
    service.refresh(ctx);
    // A fetch that is due may be slow on a busy machine: wait for it, then check nothing extra came.
    if (h.fetches.length < expected) await until(() => h.fetches.length >= expected);
    await sleep(120);
    assert.equal(h.fetches.length, expected);
  };
  await step(0, 1);
  await step(31_000, 2);
  await step(31_000, 2);
  await step(31_000, 3);
  assert.equal(h.last()?.limits, null);
  assert.equal(h.last()?.status, 'quota unavailable');
});
