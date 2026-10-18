import assert from 'node:assert/strict';
import { test } from 'node:test';
import { OpenAIHeaderQuota } from '../src/adapters/openai-header-quota.js';
import type { RateLimits } from '../src/core/rate-limits.js';
import { modelFixture } from './fixtures.js';

await test('header adapter rejects stale model/lifecycle responses and reports only known header names', () => {
  const published: RateLimits[] = [];
  const reader = new OpenAIHeaderQuota((limits) => published.push(limits));
  const ctx = {
    model: modelFixture({
      provider: 'openai',
      id: 'test',
      api: 'openai-responses',
      contextWindow: 272000,
    }),
  };
  const headers = {
    'x-ratelimit-limit-tokens': '100',
    'x-ratelimit-remaining-tokens': '25',
    'x-ratelimit-reset-tokens': '1h',
    authorization: 'secret-never-log',
    'set-cookie': 'private-cookie',
  };
  reader.ingest(headers, ctx);
  assert.equal(reader.diagnostics().lastResult, 'request-model-mismatch');
  reader.begin(ctx);
  reader.ingest(headers, ctx);
  assert.equal(published.length, 1);
  assert.equal(reader.diagnostics().lastResult, 'accepted');
  reader.invalidate();
  reader.ingest(headers, ctx);
  assert.equal(published.length, 1);
  reader.begin(ctx);
  reader.ingest({}, ctx);
  assert.equal(reader.diagnostics().lastResult, 'missing-or-invalid-rate-headers');
  assert.deepEqual(reader.diagnostics().presentFields, []);
  reader.ingest(headers, ctx);
  assert.ok(!JSON.stringify(reader.diagnostics()).includes('secret-never-log'));
  assert.ok(!JSON.stringify(reader.diagnostics()).includes('private-cookie'));
  reader.stop();
  assert.equal(reader.diagnostics().received, 0);
  assert.equal(reader.diagnostics().lastResult, 'not-observed');
});
