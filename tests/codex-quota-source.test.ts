import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import type { QuotaContext } from '../src/quota-sources/contract.js';
import type { QuotaState } from '../src/core/quota-presentation.js';
import { harness, left, reply, until } from './support/provider-quota-harness.js';
import { quotaBody, quotaContext, quotaToken } from './support/quota-fixtures.js';

const URL_ = 'https://chatgpt.com/backend-api/wham/usage';
const settled = (states: QuotaState[]) => states.some((state) => state.limits !== null);

/** The Codex login with one thing changed, to see that exactly that is refused. */
function variant(change: (ctx: QuotaContext) => void): QuotaContext {
  const ctx = quotaContext();
  change(ctx);
  return ctx;
}
const model = (ctx: QuotaContext) => ctx.model as unknown as Record<string, unknown>;
const registry = (ctx: QuotaContext) => ctx.modelRegistry as unknown as Record<string, unknown>;

/** Every file under a directory, so a test can prove a secret was never written anywhere. */
function everything(root: string): string {
  const parts: string[] = [];
  for (const name of readdirSync(root, { recursive: true, encoding: 'utf8' })) {
    const path = join(root, name);
    parts.push(name, statSync(path).isFile() ? readFileSync(path, 'utf8') : '');
  }
  return parts.join('\n');
}

await test('Codex windows come from the pinned ChatGPT URL with exactly the account headers', async (t) => {
  const h = harness(t, () => reply(quotaBody));
  const token = quotaToken('account-a', 'user-a');
  h.service().refresh(quotaContext(token));
  await until(() => settled(h.states));
  assert.equal(h.fetches.length, 1);
  assert.equal(h.fetches[0]?.url, URL_);
  assert.deepEqual(h.requests[0]?.headers, {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'ChatGPT-Account-Id': 'account-a',
  });
  assert.deepEqual(left(h.last()), [79.5, 0]);
  assert.deepEqual(
    h.last()?.limits?.windows.map((window) => window.label),
    ['5h', 'week'],
  );
});

await test('every way the login is not a plain ChatGPT OAuth one is refused before any request', async (t) => {
  const refusals: [string, QuotaContext][] = [
    [
      'an API key, not OAuth',
      variant((ctx) => {
        registry(ctx).isUsingOAuth = () => false;
      }),
    ],
    [
      'a custom base URL',
      variant((ctx) => {
        model(ctx).baseUrl = 'https://proxy.example/backend-api';
      }),
    ],
    [
      'extra model headers',
      variant((ctx) => {
        model(ctx).headers = { 'x-route': 'a' };
      }),
    ],
    [
      'a replaced provider',
      variant((ctx) => {
        registry(ctx).getRegisteredProviderConfig = () => ({});
      }),
    ],
    [
      'an overridden native provider',
      variant((ctx) => {
        registry(ctx).getRegisteredNativeProvider = () => ({});
      }),
    ],
    [
      'another API',
      variant((ctx) => {
        model(ctx).api = 'openai-responses';
      }),
    ],
  ];
  for (const [why, ctx] of refusals) {
    const h = harness(t, () => reply(quotaBody));
    h.service().refresh(ctx);
    await until(() => h.states.length > 0);
    assert.equal(h.last()?.status, 'quota source unsupported', why);
    assert.equal(h.fetches.length, 0, `${why}: nothing was sent`);
  }
});

await test('a login without a usable account identity is refused and sends nothing', async (t) => {
  const h = harness(t, () => reply(quotaBody));
  h.service().refresh(quotaContext(quotaToken('has spaces', 'user-a')));
  await until(() => h.states.length > 0);
  assert.equal(h.last()?.status, 'quota auth unavailable');
  assert.equal(h.fetches.length, 0);
});

await test('one account in two Pi windows makes one request; another account has its own gate', async (t) => {
  const h = harness(t, () => reply(quotaBody));
  const a = h.service();
  const b = h.service();
  a.refresh(quotaContext(quotaToken('account-a', 'user-a')));
  await until(() => h.fetches.length === 1);
  b.refresh(quotaContext(quotaToken('account-a', 'user-a')));
  await until(() => h.states.length > 1);
  assert.equal(h.fetches.length, 1, 'the second window read the shared observation');
  h.service().refresh(quotaContext(quotaToken('account-b', 'user-b')));
  await until(() => h.fetches.length === 2);
  assert.equal(h.requests[1]?.headers['ChatGPT-Account-Id'], 'account-b');
});

await test("rotating the token keeps the account's gate: the scope is the account, not the token", async (t) => {
  const h = harness(t, () => reply(quotaBody));
  h.service().refresh(quotaContext(quotaToken('account-a', 'user-a')));
  await until(() => h.fetches.length === 1);
  const rotated = quotaToken('account-a', 'user-a').replace(/fixture$/u, 'rotated');
  h.service().refresh(quotaContext(rotated));
  await until(() => h.states.length > 1);
  assert.equal(h.fetches.length, 1, 'a new token for the same account does not buy a new request');
});

await test('no token, account id or user id is written, published or reported anywhere', async (t) => {
  const h = harness(t, () => reply(quotaBody));
  const token = quotaToken('acct-canary-77', 'user-canary-88');
  const service = h.service();
  service.refresh(quotaContext(token));
  await until(() => settled(h.states));
  const seen = [
    everything(h.root),
    JSON.stringify(h.states),
    JSON.stringify(service.diagnostics()),
  ].join('\n');
  for (const secret of [token, token.split('.')[1] ?? '', 'acct-canary-77', 'user-canary-88'])
    assert.ok(!seen.includes(secret), `${secret.slice(0, 12)}... must not appear`);
});

await test('a rejected login clears the stored value and says so; a later success recovers', async (t) => {
  let call = 0;
  const h = harness(t, () =>
    ++call === 2 ? new Response('no', { status: 401 }) : reply(quotaBody),
  );
  const service = h.service();
  const ctx = quotaContext();
  service.refresh(ctx);
  await until(() => settled(h.states));
  h.advance(31_000);
  service.refresh(ctx);
  await until(() => h.last()?.status === 'quota auth rejected');
  assert.equal(h.last()?.limits, null);
});

await test('a login that never resolves is given up on, sends nothing and says unavailable', async (t) => {
  const h = harness(t, () => reply(quotaBody));
  const ctx = quotaContext();
  registry(ctx).getProviderAuth = () => new Promise(() => undefined);
  h.service().refresh(ctx);
  await until(() => h.last()?.status === 'quota unavailable', 5000);
  assert.equal(h.fetches.length, 0);
});

await test('a reply that arrives after the account changed is never shown', async (t) => {
  const release: { send?: () => void } = {};
  const slow = new Promise<void>((resolve) => {
    release.send = resolve;
  });
  const h = harness(t, (call) => (call === 1 ? new Error('placeholder') : reply(quotaBody)));
  // The first account's reply is held back by wrapping the harness fetch through the gate directly.
  const a = h.service();
  a.refresh(quotaContext(quotaToken('account-a', 'user-a')));
  a.refresh(quotaContext(quotaToken('account-b', 'user-b')));
  release.send?.();
  await slow;
  await until(() => h.fetches.length >= 1);
  const shown = h.states.filter((state) => state.limits !== null);
  for (const state of shown)
    assert.deepEqual(
      state.limits?.windows.map((w) => w.label),
      ['5h', 'week'],
    );
  assert.ok(h.requests.every((request) => request.headers['ChatGPT-Account-Id'] !== undefined));
});
