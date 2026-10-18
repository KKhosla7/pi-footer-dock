import assert from 'node:assert/strict';
import { test } from 'node:test';
import { statSquares } from '../src/core/diff-stat.js';

await test('five squares in the proportion of added to removed lines, the rest neutral', () => {
  assert.deepEqual(
    statSquares(1_821, 9),
    { green: 4, red: 0, neutral: 1 },
    'the screenshot: +1,821 −9',
  );
  assert.deepEqual(statSquares(10, 0), { green: 5, red: 0, neutral: 0 });
  assert.deepEqual(statSquares(0, 10), { green: 0, red: 5, neutral: 0 });
  assert.deepEqual(statSquares(5, 5), { green: 2, red: 2, neutral: 1 });
  assert.deepEqual(statSquares(0, 0), { green: 0, red: 0, neutral: 5 });
  for (const [a, d] of [
    [1, 99],
    [37, 63],
    [1_000_000, 3],
  ] as const) {
    const { green, red, neutral } = statSquares(a, d);
    assert.equal(green + red + neutral, 5);
  }
});
