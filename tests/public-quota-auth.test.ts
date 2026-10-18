import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ModelRegistry, ModelRuntime } from '@earendil-works/pi-coding-agent';
import { resolveQuotaCredential } from '../src/quota-sources/codex/login.js';
import { quotaToken } from './support/quota-fixtures.js';

type RuntimeOptions = NonNullable<Parameters<typeof ModelRuntime.create>[0]>;
type Credentials = NonNullable<RuntimeOptions['credentials']>;
type Credential = NonNullable<Awaited<ReturnType<Credentials['read']>>>;
function memoryCredentialStore() {
  const data = new Map<string, Credential>();
  const store: Credentials = {
    read: (provider) => Promise.resolve(data.get(provider)),
    list: () =>
      Promise.resolve(
        [...data].map(([providerId, credential]) => ({ providerId, type: credential.type })),
      ),
    modify: async (provider, fn) => {
      const next = await fn(data.get(provider));
      if (next) data.set(provider, next);
      return data.get(provider);
    },
    delete: (provider) => {
      data.delete(provider);
      return Promise.resolve();
    },
  };
  return store;
}
function credential(account: string, rotation = ''): Credential {
  return {
    type: 'oauth',
    access: quotaToken(account) + rotation,
    refresh: 'fixture-never-refresh',
    expires: Date.now() + 3_600_000,
  };
}
await test('final binding resolver works through real public Pi auth across A/B/A, rotation and logout', async () => {
  const original = globalThis.fetch;
  let network = 0;
  globalThis.fetch = () => {
    network += 1;
    return Promise.reject(new Error('Auth proof forbids network'));
  };
  try {
    const credentials = memoryCredentialStore();
    await credentials.modify('openai-codex', () => Promise.resolve(credential('a')));
    await credentials.modify('openai', () => Promise.resolve(credential('native-not-a-fallback')));
    const runtime = await ModelRuntime.create({
      credentials,
      modelsPath: null,
      refreshOnCreate: true,
      allowModelNetwork: false,
    });
    const registry = new ModelRegistry(runtime);
    const model = registry.find('openai-codex', 'gpt-6.1-sol');
    assert.ok(model);
    const ctx = { model, modelRegistry: registry };
    const a = await resolveQuotaCredential(ctx);
    await credentials.modify('openai-codex', () => Promise.resolve(credential('b')));
    const b = await resolveQuotaCredential(ctx);
    assert.notEqual(a.identityKey, b.identityKey);
    await credentials.modify('openai-codex', () => Promise.resolve(credential('a', '-rotation')));
    const again = await resolveQuotaCredential(ctx);
    assert.equal(a.identityKey, again.identityKey);
    await assert.rejects(
      resolveQuotaCredential({
        ...ctx,
        model: { ...model, headers: { Authorization: 'fixture-overridden' } },
      }),
      /unsupported/u,
    );
    runtime.registerVirtualModel({
      provider: 'openai-codex',
      id: 'fixture-route',
      name: 'Fixture route',
      route: () => ({ model, thinkingLevel: 'off' }),
    });
    const virtual = registry.find('openai-codex', 'fixture-route');
    assert.ok(virtual);
    await assert.rejects(
      resolveQuotaCredential({ model: virtual, modelRegistry: registry }),
      /unsupported/u,
    );
    await credentials.delete('openai-codex');
    await assert.rejects(resolveQuotaCredential(ctx));
    assert.equal(network, 0);
  } finally {
    globalThis.fetch = original;
  }
});
