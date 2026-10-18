import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { SessionSnapshotReader } from '../src/adapters/session-usage.js';
import { registryPrices } from '../src/adapters/registry-prices.js';
import { sessionUsage } from '../src/core/usage-ledger.js';
import { assistantEntry, modelFixture } from './fixtures.js';
const message = () =>
  assistantEntry(
    modelFixture({
      provider: 'openai-codex',
      id: 'gpt-6.1-sol',
      api: 'openai-codex-responses',
      contextWindow: 272_000,
    }),
  ).message;

await test('public append-only manager: one rebuild, no history copy for idle refreshes, incremental append', () => {
  const manager = SessionManager.inMemory();
  const entries = manager.getEntries.bind(manager);
  let copies = 0;
  manager.getEntries = () => {
    copies += 1;
    return entries();
  };
  const reader = new SessionSnapshotReader();
  reader.read(manager);
  for (let i = 0; i < 1000; i += 1) reader.read(manager);
  assert.equal(copies, 1);
  manager.appendMessage(message());
  reader.read(manager);
  manager.appendUsage('cache_warm', 'openai-codex', 'gpt-6.1-sol', message().usage);
  const result = reader.read(manager);
  assert.equal(copies, 1);
  assert.deepEqual(result, sessionUsage(entries()));
  reader.invalidate();
  assert.deepEqual(reader.read(manager), result);
  assert.equal(copies, 2);
});
await test('branch movement and session replacement rebuild without losing inactive-branch spend', () => {
  const manager = SessionManager.inMemory();
  const reader = new SessionSnapshotReader();
  const a = manager.appendMessage(message());
  const b = manager.appendMessage(message());
  reader.read(manager);
  manager.branch(a);
  reader.read(manager);
  manager.appendMessage(message());
  assert.equal(reader.read(manager).apiCostEstimate.responses, 3);
  assert.ok(manager.getEntry(b));
  const other = SessionManager.inMemory();
  assert.equal(reader.read(other).apiCostEstimate.responses, 0);
  other.appendMessage(message());
  assert.equal(reader.read(other).apiCostEstimate.responses, 1);
  reader.reset();
  assert.equal(reader.read(other).apiCostEstimate.responses, 1);
});
await test('explicit history invalidation rebuilds changed persisted usage at unchanged leaf/count', () => {
  const manager = SessionManager.inMemory();
  manager.appendMessage(message());
  const reader = new SessionSnapshotReader();
  assert.equal(reader.read(manager).totals.input, 1500);
  const altered = structuredClone(manager.getEntries());
  const first = altered[0];
  assert.ok(first?.type === 'message' && first.message.role === 'assistant');
  first.message.usage.input = 6000;
  manager.getEntries = () => altered;
  reader.invalidate();
  assert.equal(reader.read(manager).totals.input, 6000);
});
await test('the reader reprices unrecorded cost from the registry, and appends keep using it', () => {
  const registry = {
    find: (provider: string, id: string) =>
      provider === 'openai-codex' && id === 'gpt-6.1-sol'
        ? { cost: { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 } }
        : undefined,
  };
  const manager = SessionManager.inMemory();
  manager.appendMessage(message());
  const reader = new SessionSnapshotReader();
  const prices = registryPrices(registry as never);
  const first = reader.read(manager, prices).apiCostEstimate;
  assert.equal(first.amount, (1500 * 2 + 500 * 0.1 + 250 * 10) / 1_000_000);
  manager.appendMessage(message());
  const second = reader.read(manager, prices).apiCostEstimate;
  assert.equal(second.coverage, 'complete');
  assert.deepEqual(second.pricedBy, { reported: 0, registry: 2 });
  assert.equal(reader.read(manager).apiCostEstimate.coverage, 'complete');
});
