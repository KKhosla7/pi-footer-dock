import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compose } from '../src/core/explain/explainer.js';
import { quota } from '../src/core/explain/items/quota.js';
import { renderBlocks } from '../src/core/explain/render.js';
import type { Snapshot } from '../src/core/model.js';
import type { RateLimitWindow } from '../src/core/rate-limits.js';
import { plainStyle } from '../src/ui/explain-style.js';
import { demoSnapshot } from './reference.js';

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;
const shown = (snapshot: Snapshot): string => {
  const doc = compose(quota, {
    snapshot,
    now: NOW,
    value: 'x',
    ascii: false,
    quotaLabel: 'OpenCode Go',
  });
  return renderBlocks([...doc.headline, ...doc.body], plainStyle, 100).join('\n');
};
const withWindows = (windows: RateLimitWindow[]): Snapshot => ({
  ...demoSnapshot,
  rateLimits: { provider: 'opencode-go', model: 'm', windows },
  quotaFreshness: { ageMs: 0, receivedMono: 0, observedAt: NOW - 42_000 },
});

await test('each window shows its fill, its clock mark and its pace verdict', () => {
  const text = shown(
    withWindows([
      { label: '5h', remainingPercent: 20, resetAt: (NOW + 2.5 * HOUR) / 1000 },
      { label: 'week', remainingPercent: 90, resetAt: (NOW + 84 * HOUR) / 1000 },
      {
        label: 'month',
        remainingPercent: 50,
        resetAt: (NOW + 360 * HOUR) / 1000,
        badge: 'rate-limited',
      },
    ]),
  );
  assert.match(text, /5h\s+[█┃░]+\s+20% left · ahead of pace/u);
  assert.match(text, /week\s+[█┃░]+\s+90% left · behind pace/u);
  assert.match(text, /month\s+[█┃░]+\s+50% left · blocked: rate-limited/u);
  assert.match(text, /5h\s+20%\s+2h 30m\s+50%\s+ahead of pace \(\+30 pts\)/u);
  assert.match(text, /5h: at this rate it runs out about/u);
  assert.match(text, /Observed\s+42s ago/u);
  assert.match(text, /\(now:\s+rate-limited\)/u, 'the legend names the live status');
  assert.match(text, /Now: available/u);
});

await test('with no windows the screen says why, in the status and in words', () => {
  const doc = compose(quota, {
    snapshot: { ...demoSnapshot, rateLimits: null, quotaStatus: 'quota loading' },
    now: NOW,
    value: '',
    ascii: false,
  });
  const text = renderBlocks([...doc.headline, ...doc.body], plainStyle, 100).join('\n');
  assert.match(text, /Now: quota loading/u);
  assert.match(text, /Can be missing when/u);
});

await test('time moves the screen: the same windows read differently a few hours later', () => {
  const snapshot = withWindows([
    { label: '5h', remainingPercent: 60, resetAt: (NOW + 4 * HOUR) / 1000 },
  ]);
  const later = (ms: number) =>
    renderBlocks(
      compose(quota, { snapshot, now: NOW + ms, value: '', ascii: false }).body,
      plainStyle,
      100,
    ).join('\n');
  assert.match(later(0), /5h\s+60%\s+4h\s+20%\s+ahead of pace/u);
  assert.match(later(2.5 * HOUR), /5h\s+60%\s+1h 30m\s+70%\s+behind pace/u);
  assert.match(later(5 * HOUR), /due/u);
});
