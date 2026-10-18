import assert from 'node:assert/strict';
import { stripVTControlCharacters } from 'node:util';
import { test } from 'node:test';
import type { ApiCostEstimate } from '../src/core/api-cost.js';
import { hasCost } from '../src/core/api-cost.js';
import { portableGlyphs } from '../src/ui/glyphs.js';
import { layoutFooter } from '../src/ui/layout.js';
import { demoSnapshot } from './reference.js';

const options = { paint: (text: string) => text, glyphs: portableGlyphs, now: 4_000_000_000_000 };
const whole: ApiCostEstimate = { amount: 1.23, responses: 3, unavailable: 0, coverage: 'complete' };
const partial: ApiCostEstimate = {
  amount: null,
  pricedAmount: 0.5,
  responses: 3,
  unavailable: 1,
  coverage: 'partial',
};
const none: ApiCostEstimate = { amount: null, responses: 3, unavailable: 3, coverage: 'none' };
const footer = (apiCostEstimate: ApiCostEstimate | undefined, width: number) => {
  const snapshot = apiCostEstimate ? { ...demoSnapshot, apiCostEstimate } : demoSnapshot;
  const layout = layoutFooter(snapshot, width, options);
  return {
    text: layout.lines.map((line) => stripVTControlCharacters(line)).join('\n'),
    targets: new Set(layout.hitRegions.map((region) => region.target)),
  };
};

await test('cost has a value only for a whole or a partial amount', () => {
  assert.ok(hasCost(whole));
  assert.ok(hasCost(partial));
  assert.ok(!hasCost(none));
  assert.ok(!hasCost(undefined));
});

await test('without a cost nothing is drawn for it, at any width, so the room goes to real values', () => {
  for (const estimate of [undefined, none]) {
    for (let width = 20; width <= 260; width += 10) {
      const view = footer(estimate, width);
      assert.doesNotMatch(view.text, /cost n\/a|n\/a/u, `no n/a at ${width}`);
      assert.ok(!view.targets.has('cost'), `no cost region at ${width}`);
    }
  }
});

await test('a whole cost and a partial one are shown', () => {
  assert.match(footer(whole, 260).text, /≈\$1\.23/u);
  assert.match(footer(partial, 260).text, /≈\$0\.50\+/u);
  assert.ok(footer(whole, 260).targets.has('cost'));
});
