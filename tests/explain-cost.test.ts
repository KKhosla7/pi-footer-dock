import assert from 'node:assert/strict';
import { test } from 'node:test';
import { estimateApiCost } from '../src/core/api-cost.js';
import { cost } from '../src/core/explain/items/cost.js';
import { demoSnapshot } from './reference.js';
import { show } from './support/explain-show.js';
import { solPrices } from './support/prices.js';

const price = (input: number, cacheRead: number, output: number, total: number) => ({
  input,
  output,
  cacheRead,
  cacheWrite: 0,
  totalTokens: input + cacheRead + output,
  cost: { input: total * 0.25, output: total * 0.25, cacheRead: total * 0.5, cacheWrite: 0, total },
});
const response = (model: string, usage: ReturnType<typeof price>) => ({
  provider: 'p',
  model,
  usage,
});

await test('cost: categories and models add up to the total, and the latest response is worked out', () => {
  const estimate = estimateApiCost([
    response('a', price(1_000, 10_000, 500, 0.04)),
    response('b', price(2_000, 20_000, 700, 0.1)),
  ]);
  const breakdown = estimate.breakdown;
  assert.ok(breakdown);
  const sum = (parts: { input: number; output: number; cacheRead: number; cacheWrite: number }) =>
    parts.input + parts.output + parts.cacheRead + parts.cacheWrite;
  assert.ok(Math.abs(sum(breakdown.total.parts) - (estimate.amount ?? 0)) < 1e-9);
  const byModel = Object.values(breakdown.models).reduce((acc, row) => acc + sum(row.parts), 0);
  assert.ok(Math.abs(byModel - (estimate.amount ?? 0)) < 1e-9);
  const text = show(cost, { ...demoSnapshot, apiCostEstimate: estimate });
  assert.match(text, /This session\s+≈\$0\.14\s+at API prices/u);
  assert.match(text, /Uncached input\s+3,000/u);
  assert.match(text, /p\/b\s+1\s+22\.7k\s+\$0\.10\s+71%/u);
  assert.match(text, /p\/b: \$0\.10 \(the cost Pi recorded for it\)/u);
  assert.match(text, /2,000 uncached input × \$12\.50\/M = \$0\.03/u);
});

await test('cost: a repriced response is split by category with the same arithmetic as the total', () => {
  const unrecorded = {
    provider: 'openai-codex',
    model: 'gpt-6.1-sol',
    usage: {
      ...price(1_000, 2_000, 500, 0),
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
  };
  const estimate = estimateApiCost([unrecorded], solPrices);
  const parts = estimate.breakdown?.total.parts;
  assert.ok(parts && estimate.amount);
  assert.ok(
    Math.abs(parts.input + parts.output + parts.cacheRead + parts.cacheWrite - estimate.amount) <
      1e-12,
  );
  assert.match(
    show(cost, { ...demoSnapshot, apiCostEstimate: estimate }),
    /repriced from Pi's registry/u,
  );
});

await test('cost: what could not be priced is listed with a plain reason, and is not called free', () => {
  const free = {
    ...price(10, 0, 5, 0),
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
  const estimate = estimateApiCost([
    response('a', price(1_000, 0, 500, 0.04)),
    response('m', free),
  ]);
  const text = show(cost, { ...demoSnapshot, apiCostEstimate: estimate });
  assert.match(text, /This session\s+at least \$0\.04/u);
  assert.match(text, /Now: partial: 1 of 2 entries priced/u);
  assert.match(text, /1 of 2 recorded entries could not be priced\. They are not counted as free/u);
  assert.match(text, /1: the model has no price in Pi's registry/u);
  const none = show(cost, { ...demoSnapshot, apiCostEstimate: estimateApiCost([]) });
  assert.match(none, /Now: no recorded usage yet/u);
  assert.match(none, /nothing to show/u);
});
