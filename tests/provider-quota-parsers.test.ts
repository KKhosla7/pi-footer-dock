import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseClinePassLimits } from '../src/quota-sources/clinepass.js';
import { parseOpenCodeGoUsage } from '../src/quota-sources/opencode-go.js';
import { portableGlyphs } from '../src/ui/glyphs.js';
import { quotaHelp } from '../src/core/quota-freshness.js';
import { renderQuota } from '../src/ui/quota.js';
import { defaultFooterConfig, slotOptions } from '../src/core/footer-config.js';
import { demoSnapshot } from './reference.js';

const NOW = 1_800_000_000;
const iso = (seconds: number): string => new Date((NOW + seconds) * 1000).toISOString();
/** The response shape observed from the live ClinePass endpoint, with synthetic values. */
function cline(limits: unknown[]): unknown {
  return { success: true, data: { limits } };
}
const clineFixture = cline([
  { type: 'five_hour', percentUsed: 6, resetsAt: iso(9960) },
  { type: 'weekly', percentUsed: 52, resetsAt: iso(286_960) },
  { type: 'monthly', percentUsed: 47, resetsAt: iso(1_641_592) },
]);
/** The response shape observed from the live OpenCode Go endpoint, with synthetic values. */
function go(rolling: unknown, weekly: unknown, monthly: unknown): unknown {
  return { usage: { rolling, weekly, monthly } };
}

await test('ClinePass windows are converted from used to left, in provider order', () => {
  const windows = parseClinePassLimits(clineFixture);
  assert.deepEqual(
    windows?.map((w) => [w.label, w.remainingPercent, w.resetAt]),
    [
      ['5h', 94, NOW + 9960],
      ['week', 48, NOW + 286_960],
      ['month', 53, NOW + 1_641_592],
    ],
  );
  assert.ok(windows.every((w) => w.badge === undefined));
});

await test('windows the provider does not return are hidden, never invented', () => {
  const weeklyOnly = parseClinePassLimits(
    cline([{ type: 'weekly', percentUsed: 10, resetsAt: iso(100) }]),
  );
  assert.deepEqual(
    weeklyOnly?.map((w) => w.label),
    ['week'],
  );
  assert.equal(parseClinePassLimits(cline([])), undefined);
  assert.equal(parseClinePassLimits({}), undefined);
  assert.equal(parseClinePassLimits(null), undefined);
  assert.equal(parseOpenCodeGoUsage({ usage: {} }), undefined);
  const monthlyOnly = parseOpenCodeGoUsage(
    go(undefined, undefined, { status: 'ok', percent: 5, resetsAt: iso(100) }),
  );
  assert.deepEqual(
    monthlyOnly?.map((w) => w.label),
    ['month'],
  );
});

await test('invalid values hide that window only; nothing out of range is displayed', () => {
  const hostile = cline([
    { type: 'five_hour', percentUsed: 101, resetsAt: iso(10) },
    { type: 'weekly', percentUsed: -1, resetsAt: iso(10) },
    { type: 'monthly', percentUsed: Number.NaN, resetsAt: iso(10) },
    { type: 'weekly', percentUsed: '12', resetsAt: iso(10) },
    { type: 'unknown_window', percentUsed: 5, resetsAt: iso(10) },
    { type: 'five_hour', percentUsed: 20, resetsAt: 'not a date' },
    { type: 'five_hour', percentUsed: 20 },
    { type: 'monthly', percentUsed: 30, resetsAt: iso(50) },
  ]);
  assert.deepEqual(
    parseClinePassLimits(hostile)?.map((w) => [w.label, w.remainingPercent]),
    [['month', 70]],
  );
});

await test('the first window of a type wins and the list is bounded', () => {
  const duplicated = cline([
    { type: 'weekly', percentUsed: 10, resetsAt: iso(10) },
    { type: 'weekly', percentUsed: 90, resetsAt: iso(10) },
    ...Array.from({ length: 500 }, () => ({ type: 'x', percentUsed: 1, resetsAt: iso(10) })),
  ]);
  assert.deepEqual(
    parseClinePassLimits(duplicated)?.map((w) => [w.label, w.remainingPercent]),
    [['week', 90]],
  );
});

await test('OpenCode Go reports an exhausted window as 0 left with a rate-limited badge', () => {
  const windows = parseOpenCodeGoUsage(
    go(
      { status: 'ok', percent: 0, resetsAt: iso(18_000) },
      { status: 'ok', percent: 0, resetsAt: iso(72_525) },
      { status: 'rate-limited', percent: 100, resetsAt: iso(453_550) },
    ),
  );
  assert.deepEqual(
    windows?.map((w) => [w.label, w.remainingPercent, w.badge]),
    [
      ['5h', 100, undefined],
      ['week', 100, undefined],
      ['month', 0, 'rate-limited'],
    ],
  );
});

await test('provider-supplied status text is limited to a short safe charset', () => {
  const windows = parseOpenCodeGoUsage(
    go(
      { status: 'Rate Limited\u001b[31m', percent: 10, resetsAt: iso(10) },
      { status: 'x'.repeat(200), percent: 10, resetsAt: iso(10) },
      { status: 'paused', percent: 10, resetsAt: iso(10) },
    ),
  );
  assert.deepEqual(
    windows?.map((w) => [w.label, w.badge]),
    [
      ['5h', undefined],
      ['week', undefined],
      ['month', 'paused'],
    ],
  );
});

await test('the footer shows left values and a visible badge for the blocking window', () => {
  const windows = parseOpenCodeGoUsage(
    go(
      { status: 'ok', percent: 0, resetsAt: iso(18_000) },
      { status: 'ok', percent: 0, resetsAt: iso(72_525) },
      { status: 'rate-limited', percent: 100, resetsAt: iso(453_550) },
    ),
  );
  assert.ok(windows);
  const text = renderQuota(
    { ...demoSnapshot, rateLimits: { provider: 'opencode-go', model: 'm', windows } },
    { paint: (value) => value, glyphs: portableGlyphs, now: NOW * 1000 },
    { icon: '', budget: 300, slot: slotOptions(defaultFooterConfig(), 'quota') },
  );
  assert.match(text, /5h .* 100%/u);
  assert.match(text, /week .* 100%/u);
  assert.match(text, /month .*0% left/u);
  assert.doesNotMatch(text, /rate-limited/u);
});

await test('under a tight width the blocking window is kept and healthy ones are dropped', () => {
  const windows = parseOpenCodeGoUsage(
    go(
      { status: 'ok', percent: 0, resetsAt: iso(18_000) },
      { status: 'ok', percent: 0, resetsAt: iso(72_525) },
      { status: 'rate-limited', percent: 100, resetsAt: iso(453_550) },
    ),
  );
  assert.ok(windows);
  const text = renderQuota(
    { ...demoSnapshot, rateLimits: { provider: 'opencode-go', model: 'm', windows } },
    { paint: (value) => value, glyphs: portableGlyphs, now: NOW * 1000 },
    { icon: '', budget: 14, slot: slotOptions(defaultFooterConfig(), 'quota') },
  );
  assert.match(text, /month 0%/u);
  assert.doesNotMatch(text, /5h|week/u);
});

await test('the blocked window is drawn in red; healthy windows are not', () => {
  const windows = parseOpenCodeGoUsage(
    go(
      { status: 'ok', percent: 0, resetsAt: iso(18_000) },
      { status: 'ok', percent: 0, resetsAt: iso(72_525) },
      { status: 'rate-limited', percent: 100, resetsAt: iso(453_550) },
    ),
  );
  assert.ok(windows);
  const red: string[] = [];
  renderQuota(
    { ...demoSnapshot, rateLimits: { provider: 'opencode-go', model: 'm', windows } },
    {
      paint: (text: string, tone?: string) => {
        if (tone === 'red') red.push(text);
        return text;
      },
      glyphs: portableGlyphs,
      now: NOW * 1000,
    },
    { icon: '', budget: 300, slot: slotOptions(defaultFooterConfig(), 'quota') },
  );
  assert.ok(red.length > 0, 'the blocked window is red');
  assert.ok(
    red.every((text) => text === '0%'),
    'nothing else is red',
  );
});

await test('the quota help for server-published windows is specific and names what blocks', () => {
  const windows = parseOpenCodeGoUsage(
    go(
      { status: 'ok', percent: 0, resetsAt: iso(18_000) },
      { status: 'ok', percent: 0, resetsAt: iso(72_525) },
      { status: 'rate-limited', percent: 100, resetsAt: iso(453_550) },
    ),
  );
  assert.ok(windows);
  const help = quotaHelp(
    {
      ...demoSnapshot,
      provider: 'opencode-go',
      rateLimits: { provider: 'opencode-go', model: 'm', windows },
    },
    'OpenCode Go',
  );
  assert.match(help, /OpenCode Go reports these windows itself/u);
  assert.match(help, /share left/u);
  assert.match(help, /Blocked by the provider: month \(rate-limited\)/u);
  assert.match(help, /30 seconds/u);
  assert.doesNotMatch(help, /OpenAI|Codex|request\/model-scoped/u);
});
