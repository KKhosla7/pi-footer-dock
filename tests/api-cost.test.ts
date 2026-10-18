import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estimateApiCost } from '../src/core/api-cost.js';
import { formatApiCost } from '../src/core/model.js';
import { readSnapshot } from '../src/adapters/snapshot.js';
import { assistantEntry, modelFixture } from './fixtures.js';
import { unknownGit } from '../src/adapters/git.js';
import { solPrices } from './support/prices.js';

const response = (model = 'gpt-6.1-sol', provider = 'openai-codex') => ({
  model,
  provider,
  usage: { input: 1_000_000, cacheRead: 1_000_000, cacheWrite: 1_000_000, output: 1_000_000 },
});
await test('registry rates price distinct token categories without double counting', () => {
  assert.equal(estimateApiCost([response()], solPrices).amount, 14.6);
  assert.equal(estimateApiCost([response('gpt-5.6-sol')], solPrices).amount, 29.4);
  assert.equal(estimateApiCost([response('gpt-5.6-sol'), response()], solPrices).amount, 44);
  assert.equal(estimateApiCost([response('gpt-6-astra')], solPrices).amount, 73.5);
  assert.equal(estimateApiCost([response('gpt-6-luna', 'openai')], solPrices).amount, 0.735);
  assert.equal(estimateApiCost([response(), response('gpt-6-astra')], solPrices).amount, 88.1);
});
await test('unknown exact IDs, providers and invalid usage never produce a misleading complete total', () => {
  for (const item of [
    response('gpt-6.1-sol-alias'),
    response('gpt-6.1-sol', 'other'),
    { ...response(), usage: { ...response().usage, output: NaN } },
    { ...response(), usage: { ...response().usage, cacheWrite: -1 } },
  ]) {
    const result = estimateApiCost([response(), item], solPrices);
    assert.equal(result.amount, null);
    assert.equal(result.unavailable, 1);
    assert.equal(formatApiCost(result), '≈$14.60+');
    assert.equal(result.coverage, 'partial');
  }
  assert.equal(estimateApiCost([], solPrices).amount, null);
  assert.equal(formatApiCost({ amount: 0.001, responses: 1, unavailable: 0 }), '≈<$0.01');
  assert.equal(formatApiCost({ amount: 0, responses: 1, unavailable: 0 }), '≈$0.00');
});
await test('snapshot prefers the cost Pi recorded and does not price summary usage twice', () => {
  const model = modelFixture({
    provider: 'openai-codex',
    id: 'gpt-6.1-sol',
    api: 'openai-codex-responses',
    contextWindow: 272_000,
  });
  const entry = assistantEntry(model);
  entry.message.usage = {
    ...entry.message.usage,
    ...response().usage,
    cost: { input: 99, output: 99, cacheRead: 99, cacheWrite: 99, total: 396 },
  };
  const snapshot = readSnapshot(
    {
      cwd: '/tmp',
      model,
      thinkingLevel: 'medium',
      getContextUsage: () => undefined,
      sessionManager: { getEntries: () => [entry] },
    },
    { getSettings: () => ({}) },
    unknownGit,
  );
  assert.equal(snapshot.totals.cost, 396);
  assert.equal(snapshot.apiCostEstimate?.amount, 396);
  assert.deepEqual(snapshot.apiCostEstimate.pricedBy, { reported: 1, registry: 0 });
  assert.equal(snapshot.apiCostEstimate.responses, 1);
});
