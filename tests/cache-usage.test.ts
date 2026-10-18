import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readCacheUsage, readCachePolicy } from '../src/core/cache-usage.js';

await test('cache usage uses disjoint prompt buckets and positive reported reads only', () => {
  assert.deepEqual(readCacheUsage({ input: 100, cacheRead: 800, cacheWrite: 100 }), {
    input: 100,
    read: 800,
    write: 100,
    prompt: 1000,
    reusePercent: 80,
  });
  assert.equal(readCacheUsage({ input: 0, cacheRead: 100, cacheWrite: 0 }).reusePercent, 100);
  assert.equal(readCacheUsage({ input: 100, cacheRead: 0, cacheWrite: 0 }).reusePercent, null);
  assert.equal(readCacheUsage({ input: 0, cacheRead: 0, cacheWrite: 0 }).reusePercent, null);
});

await test('cache missing, malformed and overflowing data is never a confirmed miss or fabricated ratio', () => {
  for (const value of [
    undefined,
    null,
    'invalid',
    [],
    { input: 1, cacheRead: -1, cacheWrite: 0 },
  ]) {
    assert.equal(readCacheUsage(value).reusePercent, null);
  }
  for (const value of [NaN, Infinity, 0.5, -1, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(
      readCacheUsage({ input: value, cacheRead: 100, cacheWrite: 0 }).reusePercent,
      null,
    );
  }
  assert.equal(
    readCacheUsage({ input: Number.MAX_SAFE_INTEGER, cacheRead: 1, cacheWrite: 0 }).prompt,
    null,
  );
  const partial = readCacheUsage({ cacheRead: 100, cacheWrite: 0, payload: 'not retained' });
  assert.equal(partial.read, 100);
  assert.equal(partial.prompt, null);
  assert.ok(!JSON.stringify(partial).includes('retained'));
});

await test('cache reuse remains bounded across a deterministic counter matrix', () => {
  for (let input = 0; input <= 100; input += 10) {
    for (let read = 1; read <= 100; read += 10) {
      const sample = readCacheUsage({ input, cacheRead: read, cacheWrite: 25 });
      assert.ok(
        sample.reusePercent !== null && sample.reusePercent > 0 && sample.reusePercent <= 100,
      );
    }
  }
});

await test('policy reports only valid declared lifetimes, without guessing the active tier or expiry', () => {
  assert.deepEqual(readCachePolicy({ short: 300, long: 3600, content: 'not retained' }), {
    short: 300,
    long: 3600,
  });
  for (const short of [undefined, 0, -1, 0.5, '300', NaN, Infinity]) {
    assert.equal(readCachePolicy({ short }).short, null);
  }
  assert.deepEqual(readCachePolicy(undefined), { short: null, long: null });
});
