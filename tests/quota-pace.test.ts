import assert from 'node:assert/strict';
import { test } from 'node:test';
import { paceOf, windowLength } from '../src/core/quota-pace.js';
import type { RateLimitWindow } from '../src/core/rate-limits.js';

const HOUR = 3_600_000;
const NOW = 1_800_000_000_000;
/** A window of `label` whose clock is `elapsed` of the way through, with `used` percent used. */
function at(label: string, elapsed: number, used: number, extra: Partial<RateLimitWindow> = {}) {
  const length = windowLength(label)?.ms ?? 0;
  return {
    label,
    remainingPercent: 100 - used,
    resetAt: (NOW + length * (1 - elapsed)) / 1000,
    ...extra,
  };
}

await test('window lengths come from the label; only the month is approximate', () => {
  assert.deepEqual(windowLength('5h'), { ms: 5 * HOUR, approximate: false });
  assert.deepEqual(windowLength('week'), { ms: 168 * HOUR, approximate: false });
  assert.deepEqual(windowLength('month'), { ms: 720 * HOUR, approximate: true });
  assert.deepEqual(windowLength('3d'), { ms: 72 * HOUR, approximate: false });
  assert.deepEqual(windowLength('90m'), { ms: 90 * 60_000, approximate: false });
  assert.equal(windowLength('weird'), undefined);
});

await test('use is compared with the clock: ahead, behind or on pace, with a band of 5 points', () => {
  const cases: [string, number, number, string][] = [
    ['5h', 0.5, 50, 'on-pace'],
    ['5h', 0.5, 55, 'on-pace'],
    ['5h', 0.5, 56, 'ahead'],
    ['5h', 0.5, 45, 'on-pace'],
    ['5h', 0.5, 44, 'behind'],
    ['week', 0.2, 60, 'ahead'],
    ['week', 0.9, 10, 'behind'],
    ['month', 0.99, 99, 'on-pace'],
  ];
  for (const [label, elapsed, used, verdict] of cases)
    assert.equal(
      paceOf(at(label, elapsed, used), NOW).verdict,
      verdict,
      `${label} ${elapsed} ${used}`,
    );
});

await test('the edges are named, not guessed: out, blocked, just started, reset due, unknown length', () => {
  assert.equal(paceOf(at('5h', 0.5, 100), NOW).verdict, 'out');
  assert.equal(paceOf(at('5h', 0.5, 30, { badge: 'rate-limited' }), NOW).verdict, 'blocked');
  assert.equal(paceOf(at('5h', 0.01, 5), NOW).verdict, 'just-started');
  assert.equal(paceOf(at('5h', 1.2, 5), NOW).verdict, 'reset-due');
  assert.equal(paceOf(at('odd', 0.5, 5), NOW).verdict, 'unknown');
  assert.equal(paceOf(at('month', 0, 0), NOW).verdict, 'just-started');
  assert.equal(paceOf(at('week', 0.5, 0), NOW).verdict, 'behind', 'nothing used is behind pace');
});

await test('a reset further away than the whole window (clock skew, long month) is just started, never negative', () => {
  const pace = paceOf({ label: '5h', remainingPercent: 90, resetAt: (NOW + 9 * HOUR) / 1000 }, NOW);
  assert.equal(pace.verdict, 'just-started');
  assert.equal(pace.elapsed, 0);
});

await test('the projection needs a tenth of the window and says when it would run dry', () => {
  assert.equal(paceOf(at('5h', 0.05, 30), NOW).projectedAtReset, null, 'too early to project');
  const slow = paceOf(at('5h', 0.5, 25), NOW);
  assert.equal(Math.round(slow.projectedAtReset ?? 0), 50);
  assert.equal(slow.runsOutBeforeResetMs, null);
  const fast = paceOf(at('5h', 0.5, 80), NOW);
  assert.equal(Math.round(fast.projectedAtReset ?? 0), 160);
  // 80% used in 2.5h: the last 20% takes 0.625h, leaving 1.875h of the 2.5h to the reset.
  assert.ok(Math.abs((fast.runsOutBeforeResetMs ?? 0) - 1.875 * HOUR) < 1000);
  assert.equal(
    paceOf(at('5h', 0.5, 0), NOW).projectedAtReset,
    null,
    'nothing used, nothing to project',
  );
});

await test('the delta is use minus clock in points, and the month is flagged approximate', () => {
  const pace = paceOf(at('month', 0.5, 62), NOW);
  assert.equal(Math.round(pace.delta ?? 0), 12);
  assert.equal(pace.approximate, true);
  assert.equal(paceOf(at('week', 0.5, 62), NOW).approximate, false);
});
