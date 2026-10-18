import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QuotaBinding } from '../src/core/quota-binding.js';

const a = { provider: 'openai-codex', domain: 'subscription', identityKey: 'opaque-a' };
const b = { ...a, identityKey: 'opaque-b' };

await test('quota subscriber binds exact provider/account/domain, not model or display labels', () => {
  const binding = new QuotaBinding();
  const lease = binding.bind(a);
  assert.ok(binding.accepts(lease));
  assert.equal(
    binding.bind({ ...a }),
    lease,
    'same identity reuses a lease across token/model changes',
  );
  assert.ok(Object.isFrozen(lease));
  assert.ok(Object.isFrozen(lease.scope));
  assert.throws(() => {
    Object.assign(lease.scope, b);
  });
  const other = binding.bind(b);
  assert.ok(!binding.accepts(lease));
  assert.ok(binding.accepts(other));
  const native = binding.bind({ ...b, provider: 'openai' });
  assert.ok(!binding.accepts(other));
  const domain = binding.bind({ ...native.scope, domain: 'api-requests' });
  assert.ok(!binding.accepts(native));
  assert.ok(binding.accepts(domain));
});

await test('A/B/A switches reject obsolete callbacks even when the final account matches', async () => {
  const binding = new QuotaBinding();
  const initial = binding.bind(a);
  let release: (() => void) | undefined;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let published = false;
  const late = pending.then(() => {
    published = binding.accepts(initial);
  });
  binding.invalidate();
  assert.equal(binding.snapshot(), undefined);
  binding.bind(b);
  binding.invalidate();
  const current = binding.bind(a);
  release?.();
  await late;
  assert.ok(!published);
  assert.ok(binding.accepts(current));
  assert.ok(!binding.accepts({ ...current }), 'a copied old lease is not a current capability');
  binding.invalidate();
  assert.ok(
    !binding.accepts(current),
    'logout/shutdown detaches without changing shared admission',
  );
});
