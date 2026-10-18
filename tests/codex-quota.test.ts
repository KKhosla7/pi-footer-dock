import assert from 'node:assert/strict';
import { test } from 'node:test';
import { quotaHeaders, resolveQuotaCredential } from '../src/quota-sources/codex/login.js';
import { parseCodexUsage } from '../src/core/rate-limits.js';
import { quotaBody, quotaContext, quotaToken } from './support/quota-fixtures.js';
import { modelFixture, providerModels } from './fixtures.js';

await test('usage windows retain observed percentages and reject unknown shapes', () => {
  const limits = parseCodexUsage('openai-codex', 'test', quotaBody);
  assert.deepEqual(
    limits?.windows.map((window) => [window.label, window.remainingPercent]),
    [
      ['5h', 79.5],
      ['week', 0],
    ],
  );
  assert.equal(parseCodexUsage('openai-codex', 'test', { rate_limit: {} }), undefined);
  assert.equal(
    parseCodexUsage('openai-codex', 'test', {
      rate_limit: { primary_window: { used_percent: 10, reset_at: 123 } },
    }),
    undefined,
  );
});
await test('public auth binds account and user independently of model and token rotation', async () => {
  const a = await resolveQuotaCredential(quotaContext());
  const rotated = quotaToken().replace(/fixture$/u, 'rotated');
  const same = await resolveQuotaCredential(quotaContext(rotated));
  const b = await resolveQuotaCredential(quotaContext(quotaToken('account-b')));
  const otherUser = await resolveQuotaCredential(quotaContext(quotaToken('account-a', 'user-b')));
  assert.equal(a.identityKey, same.identityKey);
  assert.notEqual(a.identityKey, b.identityKey);
  assert.notEqual(a.identityKey, otherUser.identityKey);
  assert.match(a.identityKey, /^[a-f0-9]{64}$/u);
  assert.ok(!JSON.stringify(a.identityKey).includes('account-a'));
  assert.equal(a.headers['ChatGPT-Account-Id'], 'account-a');
});
await test('native OpenAI, virtual models, custom sources and unidentifiable users fail closed', async () => {
  const ctx = quotaContext();
  await assert.rejects(quotaHeaders({ ...ctx, model: providerModels[1] }), {
    problem: 'unsupported',
  });
  await assert.rejects(
    resolveQuotaCredential({
      ...ctx,
      model: modelFixture({
        provider: 'openai-codex',
        api: 'pi-virtual',
        id: 'routed',
        contextWindow: 272000,
      }),
    }),
    { problem: 'unsupported' },
  );
  const token = `fixture.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'account-a' } })).toString('base64url')}.fixture`;
  await assert.rejects(resolveQuotaCredential(quotaContext(token)), { problem: 'auth' });
  await assert.rejects(resolveQuotaCredential(quotaContext('malformed-token')), {
    problem: 'auth',
  });
});
