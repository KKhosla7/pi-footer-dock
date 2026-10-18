import assert from 'node:assert/strict';
import { test } from 'node:test';
import { UsageLedger, sessionUsage } from '../src/core/usage-ledger.js';
import { estimateApiCost } from '../src/core/api-cost.js';
import { solPrices, tablePrices } from './support/prices.js';
import { assistantEntry, modelFixture } from './fixtures.js';
const model = modelFixture({
  provider: 'openai-codex',
  id: 'gpt-6.1-sol',
  api: 'openai-codex-responses',
  contextWindow: 272_000,
});
const a = assistantEntry(model, 'a');
const standalone = {
  type: 'usage',
  id: 'b',
  provider: model.provider,
  model: model.id,
  usage: a.message.usage,
};

await test('assistant and explicit standalone contributions are both priced, repriced from the registry when Pi recorded no cost', () => {
  const result = sessionUsage([a, standalone], solPrices);
  assert.equal(result.apiCostEstimate.responses, 2);
  assert.equal(result.apiCostEstimate.amount, ((1500 * 2 + 500 * 0.1 + 250 * 10) * 2) / 1_000_000);
  assert.equal(result.totals.input, 3000);
  assert.equal(result.totals.cost, 0);
});
await test('recorded summaries without canonical model attribution block completeness, not assumed current-model charges', () => {
  for (const type of ['compaction', 'branch_summary']) {
    const result = sessionUsage([a, { type, id: 'summary', usage: a.message.usage }], solPrices);
    assert.equal(result.totals.input, 3000);
    assert.equal(result.apiCostEstimate.amount, null);
    assert.equal(result.apiCostEstimate.reasons?.['unassigned-model'], 1);
  }
});
await test('nested-tool and unknown usage-bearing records cannot silently disappear from coverage', () => {
  for (const entry of [
    { type: 'message', id: 'tool', message: { role: 'toolResult', usage: a.message.usage } },
    { type: 'future_usage', id: 'future', usage: a.message.usage },
  ]) {
    const result = sessionUsage([a, entry], solPrices);
    assert.equal(result.totals.input, 3000);
    assert.equal(result.apiCostEstimate.amount, null);
    assert.equal(result.apiCostEstimate.reasons?.['unassigned-model'], 1);
  }
});
await test('malformed persisted fields never throw, poison other categories or become a complete partial estimate', () => {
  for (const usage of [
    undefined,
    null,
    {},
    { ...a.message.usage, input: '10' },
    { ...a.message.usage, input: -1 },
  ]) {
    const result = sessionUsage([a, { ...standalone, usage }], solPrices);
    assert.equal(result.apiCostEstimate.amount, null);
    assert.equal(result.totals.input, null);
  }
  const result = sessionUsage(
    [{ ...standalone, usage: { ...a.message.usage, cost: undefined } }],
    solPrices,
  );
  assert.equal(result.totals.cost, null);
  assert.equal(result.totals.input, 1500);
  assert.ok(result.apiCostEstimate.amount !== null);
});
await test('duplicate recorded identity is counted once; conflicting duplicates and missing IDs fail closed', () => {
  assert.equal(sessionUsage([a, structuredClone(a)], solPrices).apiCostEstimate.responses, 1);
  const conflict = structuredClone(a);
  conflict.message.usage.output += 1;
  const result = sessionUsage([a, conflict], solPrices);
  assert.equal(result.apiCostEstimate.amount, null);
  assert.equal(result.totals.input, null);
  assert.equal(result.apiCostEstimate.reasons?.['duplicate-entry'], 1);
  assert.equal(
    sessionUsage([{ ...standalone, id: undefined }], solPrices).apiCostEstimate.reasons?.[
      'invalid-entry'
    ],
    1,
  );
});
await test('incremental append matches a clean rebuild and snapshots cannot mutate the ledger', () => {
  const ledger = new UsageLedger(solPrices);
  ledger.append([a]);
  ledger.append([standalone]);
  assert.deepEqual(ledger.snapshot(), sessionUsage([a, standalone], solPrices));
  const snapshot = ledger.snapshot();
  snapshot.totals.input = 999;
  assert.equal(ledger.snapshot().totals.input, 3000);
  assert.equal(ledger.parsedEntries, 2);
});
await test('prices are independently replaceable and reasons and models stay bounded', () => {
  const response = a.message;
  const alternate = tablePrices({
    [`${model.provider}/${model.id}`]: { input: 1, output: 1, cacheRead: 1, cacheWrite: 1 },
  });
  assert.equal(estimateApiCost([response], alternate).amount, 2250 / 1_000_000);
  assert.equal(estimateApiCost([undefined], solPrices).reasons?.['missing-usage'], 1);
  assert.equal(
    estimateApiCost([{ ...response, provider: 'other' }], solPrices).reasons?.[
      'missing-model-price'
    ],
    1,
  );
  assert.equal(
    estimateApiCost([{ ...response, model: 'other' }], solPrices).reasons?.['missing-model-price'],
    1,
  );
  const many = Array.from({ length: 100 }, (_, index) => ({
    ...response,
    model: `model-${index}`,
  }));
  assert.ok(Object.keys(estimateApiCost(many, solPrices).models ?? {}).length <= 17);
});
await test('overflow and invalid price data are unavailable, never Infinity or a thrown refresh', () => {
  const response = { ...a.message, usage: { ...a.message.usage, input: Number.MAX_SAFE_INTEGER } };
  assert.equal(estimateApiCost([response, response], solPrices).amount, null);
  const bad = tablePrices({ [`${model.provider}/${model.id}`]: { input: -1, output: 1 } });
  const result = estimateApiCost([a.message], bad);
  assert.equal(result.coverage, 'none');
  assert.equal(result.reasons?.['missing-model-price'], 1);
});
