import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
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

await test('a rejected key clears the stored value and says so', async (t) => {
  const h = harness(t, (n, clock) =>
    n === 1 ? reply(clineBody(clock)) : reply({}, { status: 401 }),
  );
  const service = h.service();
  const { ctx } = context('clinepass', CLINE);
  service.refresh(ctx);
  await until(() => h.last()?.limits !== null && h.last()?.limits !== undefined);
  h.advance(31_000);
  service.refresh(ctx);
  await until(() => h.last()?.status === 'quota auth rejected');
  assert.equal(h.last()?.limits, null, 'the rejected credential no longer shows a value');
});

await test('a failing refresh keeps the last value, marked stale', async (t) => {
  const h = harness(t, (n, clock) => (n === 1 ? reply(goBody(clock)) : new Error('network down')));
  const service = h.service();
  const { ctx } = context('opencode-go', GO);
  service.refresh(ctx);
  await until(() => h.last()?.limits !== null && h.last()?.limits !== undefined);
  h.advance(31_000);
  service.refresh(ctx);
  await until(() => h.last()?.status === 'quota stale');
  assert.deepEqual(left(h.last()), [100, 100, 0]);
});

await test('nothing is sent when the configured base URL is not the pinned origin', async (t) => {
  const h = harness(t, (_n, clock) => reply(clineBody(clock)));
  const { ctx, calls } = context('clinepass', 'https://proxy.example.test/api/v1');
  h.service().refresh(ctx);
  await until(() => h.last()?.status === 'quota source unsupported');
  assert.equal(h.fetches.length, 0);
  assert.deepEqual(calls.auth, [], 'the credential is not even resolved for an unpinned origin');
});

await test('a missing key is reported without any request', async (t) => {
  const h = harness(t, (_n, clock) => reply(clineBody(clock)));
  h.service().refresh(context('opencode-go', GO, { key: null }).ctx);
  await until(() => h.last()?.status === 'quota auth unavailable');
  assert.equal(h.fetches.length, 0);
});

await test('a different key never shows the previous key’s value', async (t) => {
  const h = harness(t, (_n, clock) => reply(clineBody(clock)));
  const service = h.service();
  const credential = { key: KEY };
  const { ctx } = context('clinepass', CLINE, credential);
  service.refresh(ctx);
  await until(() => h.last()?.limits !== null && h.last()?.limits !== undefined);
  credential.key = 'a-different-account-key';
  h.advance(3000);
  const before = h.states.length;
  service.refresh(ctx);
  await until(() => h.states.length > before);
  assert.equal(h.states[before]?.limits, null, 'the first state after the change shows no value');
  assert.equal(h.states[before].status, 'quota loading');
});

await test('no credential or response text is stored, published or reported', async (t) => {
  const h = harness(t, (_n, clock) => reply(clineBody(clock)));
  const service = h.service();
  service.refresh(context('clinepass', CLINE).ctx);
  await until(() => h.last()?.limits !== null && h.last()?.limits !== undefined);
  const seen = JSON.stringify([h.states, service.diagnostics()]);
  assert.ok(!seen.includes(KEY));
  for (const name of readdirSync(h.root)) {
    assert.ok(
      !readFileSync(join(h.root, name), 'utf8').includes(KEY),
      `${name} holds no credential`,
    );
  }
  service.dispose();
  assert.equal(service.diagnostics().adapter, null);
});
