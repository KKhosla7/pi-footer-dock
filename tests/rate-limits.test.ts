import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  formatReset,
  parseRateLimits,
  parseStoredRateLimits,
  windowLabel,
} from '../src/core/rate-limits.js';

await test('Codex rate-limit stream events are parsed without inventing missing windows', () => {
  const parsed = parseRateLimits('opencode-go', 'gpt-test', {
    type: 'codex.rate_limits',
    rate_limits: {
      primary: { used_percent: 96, window_minutes: 300, reset_at: 2_000_000_000 },
      secondary: { used_percent: 78, window_minutes: 10_080, reset_at: 2_000_100_000 },
    },
    additional_rate_limits: [
      {
        rate_limits: {
          primary: { used_percent: 94, window_minutes: 43_200, reset_at: 2_001_000_000 },
        },
      },
    ],
  });
  assert.deepEqual(parsed, {
    provider: 'opencode-go',
    model: 'gpt-test',
    windows: [
      { label: '5h', remainingPercent: 4, resetAt: 2_000_000_000 },
      { label: 'week', remainingPercent: 22, resetAt: 2_000_100_000 },
      { label: 'month', remainingPercent: 6, resetAt: 2_001_000_000 },
    ],
  });
});

await test('provider-specific Codex events work while malformed or unrelated events are ignored', () => {
  const valid = {
    type: 'codex.rate_limits',
    rate_limits: {
      primary: { used_percent: 101, window_minutes: 300, reset_at: 2_000_000_000 },
    },
  };
  assert.equal(parseRateLimits('custom-codex-proxy', 'x', valid), undefined);
  assert.equal(parseRateLimits('openai-codex', 'x', valid), undefined);
  assert.equal(parseRateLimits('openai-codex', 'x', { type: 'other' }), undefined);
});

await test('validated remaining quota can be restored across extension reloads', () => {
  assert.deepEqual(
    parseStoredRateLimits({
      provider: 'opencode-go',
      model: 'gpt-test',
      windows: [{ label: '5h', remainingPercent: 80, resetAt: 2_000_000_000 }],
    }),
    {
      provider: 'opencode-go',
      model: 'gpt-test',
      windows: [{ label: '5h', remainingPercent: 80, resetAt: 2_000_000_000 }],
    },
  );
  assert.equal(parseStoredRateLimits({ provider: 'x', model: 'y', windows: [] }), undefined);
  assert.deepEqual(
    parseStoredRateLimits({
      provider: 'opencode-go',
      model: 'gpt-test',
      windows: [{ label: '5h', usedPercent: 20, resetAt: 2_000_000_000 }],
    })?.windows,
    [{ label: '5h', remainingPercent: 80, resetAt: 2_000_000_000 }],
  );
});

await test('window and reset labels match the compact reference vocabulary', () => {
  assert.equal(windowLabel(300), '5h');
  assert.equal(windowLabel(10_080), 'week');
  assert.equal(windowLabel(43_200), 'month');
  assert.equal(formatReset(2_000_000_000, 1_999_910_000_000), '1d 1h');
});
