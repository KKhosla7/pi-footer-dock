import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import { calculateCost } from '@earendil-works/pi-ai';
import type { Api, Model, Usage } from '@earendil-works/pi-ai';
import { registryPrices } from '../src/adapters/registry-prices.js';
import { estimateApiCost, hasCost } from '../src/core/api-cost.js';
import { formatApiCost } from '../src/core/model.js';
import { validRates } from '../src/core/price-source.js';
import { costFromRates } from '../src/core/response-price.js';
import { tablePrices } from './support/prices.js';

const tokens = { input: 1_000, output: 500, cacheRead: 2_000, cacheWrite: 100 };
const flat = { input: 1, output: 2, cacheRead: 0.5, cacheWrite: 3 };
const costOf = (total: number, skew = 0) => ({
  input: 0.001,
  output: 0.001,
  cacheRead: 0.001,
  cacheWrite: 0.001,
  total: total + skew,
});
const response = (cost?: unknown, model = 'm') => ({
  provider: 'p',
  model,
  usage: { ...tokens, ...(cost ? { cost } : {}) },
});
// 1000*1 + 500*2 + 2000*0.5 + 100*3 = 3300 per million
const REPRICED = 3300 / 1_000_000;

await test('Pi recorded cost wins over the registry rate, which only fills in when Pi recorded none', () => {
  const prices = tablePrices({ 'p/m': flat });
  const reported = estimateApiCost([response(costOf(0.004))], prices);
  assert.equal(reported.amount, 0.004);
  assert.deepEqual(reported.pricedBy, { reported: 1, registry: 0 });
  const missing = estimateApiCost([response()], prices);
  assert.equal(missing.amount, REPRICED);
  assert.deepEqual(missing.pricedBy, { reported: 0, registry: 1 });
  const zero = estimateApiCost([response({ ...costOf(0), total: 0 })], prices);
  assert.equal(
    zero.amount,
    REPRICED,
    'a recorded zero is not trusted when the registry has a price',
  );
});
await test('an inconsistent or invalid recorded cost is ignored, not trusted', () => {
  const prices = tablePrices({ 'p/m': flat });
  for (const cost of [costOf(9, 5), { ...costOf(1), total: -1 }, { ...costOf(1), input: NaN }, 'x'])
    assert.equal(estimateApiCost([response(cost)], prices).amount, REPRICED);
  assert.equal(estimateApiCost([response(costOf(9, 5))]).amount, null);
});
await test('a model gone from the registry still counts via Pi cost, and is excluded without one', () => {
  const none = tablePrices({});
  assert.equal(estimateApiCost([response(costOf(0.004), 'retired')], none).amount, 0.004);
  const mixed = estimateApiCost(
    [response(costOf(0.004), 'retired'), response(undefined, 'x')],
    none,
  );
  assert.equal(mixed.coverage, 'partial');
  assert.equal(mixed.reasons?.['missing-model-price'], 1);
  assert.equal(formatApiCost(mixed), '≈cost n/a');
});
await test('a zero price is unknown, never a silent free response, and draws nothing', () => {
  const zeros = tablePrices({ 'p/m': { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } });
  const result = estimateApiCost([response(costOf(0))], zeros);
  assert.equal(result.coverage, 'none');
  assert.equal(result.reasons?.['zero-price'], 1);
  assert.ok(!hasCost(result));
});
await test('a response with no tokens costs nothing and needs no price', () => {
  const idle = {
    provider: 'p',
    model: 'm',
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
  assert.equal(estimateApiCost([idle]).amount, 0);
});
await test('registry validation rejects malformed prices instead of guessing', () => {
  assert.equal(validRates(undefined), undefined);
  assert.equal(validRates({ ...flat, input: -1 }), undefined);
  assert.equal(validRates({ ...flat, output: '2' }), undefined);
  assert.equal(validRates({ ...flat, tiers: [{ ...flat }] }), undefined);
  assert.equal(validRates({ ...flat, tiers: 'x' }), undefined);
  assert.deepEqual(validRates({ ...flat, junk: 1 }), flat);
});
/** Checks our arithmetic against pi-ai's at several input sizes; returns how many differed by tier. */
function parityFor(model: Model<Api>): number {
  const rates = validRates(model.cost);
  assert.ok(rates, `${model.provider}/${model.id} has valid rates`);
  let tiered = 0;
  for (const input of [10, 150_000, 300_000, 600_000]) {
    const usage: Usage = {
      input,
      output: 777,
      cacheRead: 1_234,
      cacheWrite: 400,
      cacheWrite1h: 150,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    };
    const expected = calculateCost(model, usage).total;
    const actual = costFromRates(rates, usage, 150);
    assert.ok(actual !== null);
    assert.ok(Math.abs(actual - expected) <= 1e-12 * Math.max(1, expected));
    if (rates.tiers?.length && actual !== costFromRates({ ...rates, tiers: [] }, usage, 150))
      tiered += 1;
  }
  return tiered;
}

await test('repricing equals pi-ai calculateCost for every model in the real registry, tiers and 1h writes included', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-registry-'));
  try {
    const runtime = await ModelRuntime.create({
      authPath: join(directory, 'auth.json'),
      modelsPath: null,
      modelsStorePath: join(directory, 'store.json'),
      allowModelNetwork: false,
      refreshOnCreate: false,
    });
    const models = runtime.getModels();
    assert.ok(models.length > 1_000, `registry has ${models.length} models`);
    const tiered = models.reduce((count, model) => count + parityFor(model), 0);
    assert.ok(tiered > 0, 'at least one tiered model priced differently above its threshold');
    const prices = registryPrices({ find: (provider, id) => runtime.getModel(provider, id) });
    assert.equal(prices.priceFor('anthropic', 'claude-haiku-4-5')?.input, 1);
    assert.equal(prices.priceFor('opencode-go', 'minimax-m3')?.output, 1.2);
    assert.equal(prices.priceFor('opencode-go', 'no-such-model'), undefined);
    assert.equal(
      registryPrices({
        find: () => {
          throw new Error('boom');
        },
      }).priceFor('a', 'b'),
      undefined,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
