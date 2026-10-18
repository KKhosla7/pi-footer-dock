import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseOpenAIRateHeaders } from '../src/core/openai-rate-headers.js';

await test('OpenAI HTTP headers provide actual API buckets, never invented subscription windows', () => {
  const limits = parseOpenAIRateHeaders(
    'gpt-test',
    {
      'X-RateLimit-Limit-Tokens': '1000',
      'x-ratelimit-remaining-tokens': '250',
      'x-ratelimit-reset-tokens': '1h2m3.5s',
      'x-ratelimit-limit-requests': '10',
      'x-ratelimit-remaining-requests': '6',
      'x-ratelimit-reset-requests': '120ms',
      'set-cookie': 'private cookie must never be returned',
    },
    4_000_000_000_000,
  );
  assert.ok(limits);
  assert.deepEqual(
    limits.windows.map((window) => [window.label, window.remainingPercent]),
    [
      ['API tokens', 25],
      ['API requests', 60],
    ],
  );
  assert.equal(limits.windows[0]?.resetAt, 4_000_003_723.5);
  assert.equal(limits.windows[1]?.resetAt, 4_000_000_000.12);
  assert.ok(!JSON.stringify(limits).includes('private cookie'));
});

await test('missing/malformed/unlimited headers are not represented as fabricated quotas', () => {
  const base = {
    'x-ratelimit-limit-tokens': '100',
    'x-ratelimit-remaining-tokens': '25',
    'x-ratelimit-reset-tokens': '1s',
  };
  for (const headers of [
    {},
    { ...base, 'x-ratelimit-limit-tokens': '0' },
    { ...base, 'x-ratelimit-remaining-tokens': '101' },
    { ...base, 'x-ratelimit-reset-tokens': 'tomorrow' },
    { ...base, 'x-ratelimit-reset-tokens': '0s' },
    { ...base, 'x-ratelimit-remaining-tokens': '' },
  ])
    assert.equal(parseOpenAIRateHeaders('test', headers), undefined);
});
