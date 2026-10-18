import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sessionUsage } from '../src/core/usage-ledger.js';
import { estimateApiCost, hasCost } from '../src/core/api-cost.js';
import { formatApiCost } from '../src/core/model.js';
import { solPrices } from './support/prices.js';
import { layoutFooter } from '../src/ui/layout.js';
import { defaultFooterConfig } from '../src/core/footer-config.js';
import { portableGlyphs } from '../src/ui/glyphs.js';
import { assistantEntry, modelFixture } from './fixtures.js';
import { demoSnapshot } from './reference.js';
const assistant = assistantEntry(
  modelFixture({
    provider: 'openai-codex',
    id: 'gpt-6.1-sol',
    api: 'openai-codex-responses',
    contextWindow: 272_000,
  }),
);
const summaries = Array.from({ length: 5 }, (_, index) => ({
  type: 'compaction',
  id: `summary-${index}`,
  usage: assistant.message.usage,
}));

await test('five persisted unassigned compactions do not erase the explicitly labelled priced portion', () => {
  const estimate = sessionUsage([assistant, ...summaries], solPrices).apiCostEstimate;
  assert.equal(estimate.amount, null);
  assert.equal(estimate.coverage, 'partial');
  assert.equal(estimate.pricedResponses, 1);
  assert.equal(estimate.unavailable, 5);
  assert.equal(estimate.pricedAmount, estimateApiCost([assistant.message], solPrices).amount);
  assert.equal(formatApiCost(estimate), '≈cost n/a'); // under a cent: nothing to draw
});
await test('complete, empty and entirely unpriceable estimates retain distinct honest labels', () => {
  const complete = sessionUsage([assistant], solPrices).apiCostEstimate;
  assert.equal(complete.coverage, 'complete');
  assert.ok(!formatApiCost(complete).includes('partial'));
  for (const entries of [[], summaries]) {
    const result = sessionUsage(entries, solPrices).apiCostEstimate;
    assert.equal(result.pricedAmount, null);
    assert.equal(result.coverage, 'none');
    assert.equal(formatApiCost(result), '≈cost n/a');
  }
});
await test('ambiguous duplicate identities and overflow cannot masquerade as safe partial prices', () => {
  const conflict = structuredClone(assistant);
  conflict.message.usage.output += 1;
  const ambiguous = sessionUsage([assistant, conflict], solPrices).apiCostEstimate;
  assert.equal(ambiguous.coverage, 'none');
  assert.equal(formatApiCost(ambiguous), '≈cost n/a');
  const huge = {
    ...assistant.message,
    usage: { ...assistant.message.usage, input: Number.MAX_SAFE_INTEGER },
  };
  assert.equal(formatApiCost(estimateApiCost([huge, huge], solPrices)), '≈cost n/a');
});
await test('a partial total is a lower bound marked "+", and nothing is drawn under a cent', () => {
  for (const amount of [0, 0.001, 0.0099]) {
    const estimate = {
      amount: null,
      responses: 2,
      unavailable: 1,
      pricedAmount: amount,
      pricedResponses: 1,
      coverage: 'partial' as const,
    };
    assert.equal(formatApiCost(estimate), '≈cost n/a');
    assert.equal(hasCost(estimate), false);
  }
  const cents = {
    amount: null,
    responses: 2,
    unavailable: 1,
    pricedAmount: 0.01,
    coverage: 'partial' as const,
  };
  assert.equal(formatApiCost(cents), '≈$0.01+');
  assert.equal(hasCost(cents), true);
});
await test('the partial marker cannot be clipped off while its currency value remains visible', () => {
  const estimate = {
    ...sessionUsage([assistant, ...summaries], solPrices).apiCostEstimate,
    pricedAmount: 3.14,
  };
  for (const side of ['left', 'right'] as const)
    for (let gap = 0; gap <= 6; gap += 1)
      for (let width = 1; width <= 220; width += 1) {
        const config = defaultFooterConfig();
        config.rows = [
          { left: [], right: [] },
          { left: side === 'left' ? ['cost'] : [], right: side === 'right' ? ['cost'] : [] },
        ];
        config.slots.cost = { gap };
        const line =
          layoutFooter({ ...demoSnapshot, apiCostEstimate: estimate }, width, {
            config,
            paint: (text) => text,
            glyphs: portableGlyphs,
          }).lines[1] ?? '';
        assert.ok(!line.includes('$') || line.includes('≈$3.14+'), `width=${width}, side=${side}`);
      }
});
