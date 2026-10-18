import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { quotaHeaders } from '../src/quota-sources/codex/login.js';
import { modelFixture } from './fixtures.js';

await test('identical model names and two stored OAuth logins do not permit cross-provider quota authentication', async () => {
  const openai = modelFixture({
    provider: 'openai',
    id: 'gpt-6.1-sol',
    api: 'openai-responses',
    contextWindow: 272000,
  });
  const codex = { ...openai, provider: 'openai-codex' };
  const resolved: string[] = [];
  const token = `fixture.${Buffer.from(JSON.stringify({ 'https://api.openai.com/auth': { chatgpt_account_id: 'fixture-account' } })).toString('base64url')}.fixture`;
  const modelRegistry = {
    find: (provider: string) => (provider === 'openai' ? openai : codex),
    isUsingOAuth: () => true,
    getProviderAuth: (provider: string) => {
      resolved.push(provider);
      return Promise.resolve({ auth: { apiKey: token } });
    },
  } as unknown as ExtensionContext['modelRegistry'];
  await assert.rejects(quotaHeaders({ model: openai, modelRegistry }), { problem: 'unsupported' });
  assert.deepEqual(resolved, []);
  const headers = await quotaHeaders({ model: codex, modelRegistry });
  assert.deepEqual(resolved, ['openai-codex']);
  assert.equal(headers.Authorization, `Bearer ${token}`);
});
