import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reserveFor } from '../src/core/compaction-help.js';

await test('the reserve that gives a percent is what is left above it', () => {
  assert.equal(reserveFor(1_000_000, 70), 300_000);
  assert.equal(reserveFor(200_000, 90), 20_000);
  assert.equal(reserveFor(1_000_000, 100), 0);
  assert.equal(reserveFor(131_072, 80), 26_214);
});
