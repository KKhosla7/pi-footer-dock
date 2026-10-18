import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EndpointError, authorizedGet, retryAfterMs } from '../src/adapters/authorized-fetch.js';
import type { PinnedEndpoint } from '../src/adapters/authorized-fetch.js';

const CANARY = 'credential-canary-9f3a';
const endpoint: PinnedEndpoint = { origin: 'https://api.example.test', path: '/v1/usage' };
interface Recorded {
  url: string;
  init: RequestInit;
}
function recorder(respond: () => Response | Promise<Response>) {
  const calls: Recorded[] = [];
  const fake = ((input: URL | string, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return Promise.resolve(respond());
  }) as typeof fetch;
  return { calls, fake };
}
const json = (value: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
async function rejection(promise: Promise<unknown>): Promise<EndpointError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof EndpointError, 'only fixed-code endpoint errors may escape');
    return error;
  }
  throw new Error('expected a rejection');
}

await test('a credential is sent only to the pinned URL, with no redirects', async () => {
  const { calls, fake } = recorder(() => json({ ok: 1 }));
  const reply = await authorizedGet(
    endpoint,
    { token: CANARY },
    {
      signal: new AbortController().signal,
      fetch: fake,
    },
  );
  assert.deepEqual(reply.body, { ok: 1 });
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.url, 'https://api.example.test/v1/usage');
  assert.equal(calls[0].init.redirect, 'error');
  assert.equal(calls[0].init.method, 'GET');
  assert.deepEqual(calls[0].init.headers, {
    Authorization: `Bearer ${CANARY}`,
    Accept: 'application/json',
  });
});

await test('any other origin, scheme, query, userinfo or fragment is refused before a request', async () => {
  const bad: PinnedEndpoint[] = [
    { origin: 'http://api.example.test', path: '/v1/usage' },
    { origin: 'https://api.example.test', path: '//evil.example/steal' },
    { origin: 'https://api.example.test', path: 'https://evil.example/steal' },
    { origin: 'https://api.example.test', path: '/v1/usage?token=1' },
    { origin: 'https://api.example.test', path: '/v1/usage#x' },
    { origin: 'https://user:pass@api.example.test', path: '/v1/usage' },
  ];
  for (const candidate of bad) {
    const { calls, fake } = recorder(() => json({}));
    const error = await rejection(
      authorizedGet(
        candidate,
        { token: CANARY },
        { signal: new AbortController().signal, fetch: fake },
      ),
    );
    assert.equal(error.code, 'bad-endpoint');
    assert.equal(calls.length, 0, `no request may be made for ${candidate.path}`);
  }
});

await test('malformed credentials are refused and never appear in errors', async () => {
  for (const token of ['', 'a b', 'bad\nheader', 'x'.repeat(9000), 'zero\u0000']) {
    const { calls, fake } = recorder(() => json({}));
    const error = await rejection(
      authorizedGet(endpoint, { token }, { signal: new AbortController().signal, fetch: fake }),
    );
    assert.equal(error.code, 'bad-credential');
    assert.equal(calls.length, 0);
  }
  const failing = recorder(() => {
    throw new Error(`boom ${CANARY}`);
  });
  const error = await rejection(
    authorizedGet(
      endpoint,
      { token: CANARY },
      {
        signal: new AbortController().signal,
        fetch: failing.fake,
      },
    ),
  );
  assert.equal(error.code, 'network');
  assert.ok(!String(error).includes(CANARY) && !JSON.stringify(error).includes(CANARY));
});

await test('abort is reported as a timeout, other transport failures as network', async () => {
  const controller = new AbortController();
  const slow = recorder(() => {
    controller.abort();
    throw new Error('aborted');
  });
  const aborted = await rejection(
    authorizedGet(endpoint, { token: CANARY }, { signal: controller.signal, fetch: slow.fake }),
  );
  assert.equal(aborted.code, 'timeout');
});

await test('non-success replies carry the status and a parsed Retry-After, never a body', async () => {
  const { fake } = recorder(() =>
    json({ secret: CANARY }, { status: 429, headers: { 'retry-after': '120' } }),
  );
  const reply = await authorizedGet(
    endpoint,
    { token: CANARY },
    {
      signal: new AbortController().signal,
      fetch: fake,
    },
  );
  assert.equal(reply.status, 429);
  assert.equal(reply.body, null);
  assert.equal(reply.retryAfterMs, 120_000);
  const headers = new Headers({ 'retry-after': new Date(10_000 + 90_000).toUTCString() });
  assert.ok((retryAfterMs(headers, 10_000) ?? 0) > 80_000);
  assert.equal(retryAfterMs(new Headers({ 'retry-after': 'soon' }), 0), null);
  assert.equal(retryAfterMs(new Headers(), 0), null);
});

await test('oversized and non-JSON bodies are rejected with fixed codes', async () => {
  const huge = recorder(() => new Response('x'.repeat(70_000), { status: 200 }));
  assert.equal(
    (
      await rejection(
        authorizedGet(
          endpoint,
          { token: CANARY },
          { signal: new AbortController().signal, fetch: huge.fake },
        ),
      )
    ).code,
    'too-large',
  );
  const declared = recorder(
    () => new Response('{}', { status: 200, headers: { 'content-length': '999999' } }),
  );
  assert.equal(
    (
      await rejection(
        authorizedGet(
          endpoint,
          { token: CANARY },
          {
            signal: new AbortController().signal,
            fetch: declared.fake,
          },
        ),
      )
    ).code,
    'too-large',
  );
  const text = recorder(() => new Response('<html>', { status: 200 }));
  assert.equal(
    (
      await rejection(
        authorizedGet(
          endpoint,
          { token: CANARY },
          { signal: new AbortController().signal, fetch: text.fake },
        ),
      )
    ).code,
    'invalid-json',
  );
});

await test('an account id is sent as its own header, and only a plain one is accepted', async () => {
  const sent: Record<string, string>[] = [];
  const fake = ((_url: URL, init?: RequestInit) => {
    sent.push(init?.headers as Record<string, string>);
    return Promise.resolve(new Response('{}', { status: 200 }));
  }) as unknown as typeof fetch;
  const options = { signal: new AbortController().signal, fetch: fake };
  await authorizedGet(endpoint, { token: CANARY, accountId: 'account-1_ok' }, options);
  assert.equal(sent[0]?.['ChatGPT-Account-Id'], 'account-1_ok');
  await authorizedGet(endpoint, { token: CANARY }, options);
  assert.equal(sent[1]?.['ChatGPT-Account-Id'], undefined, 'no header without an account');
  for (const bad of ['', 'a b', 'a\nb', 'x'.repeat(257), 'ü', '../x'])
    await assert.rejects(
      authorizedGet(endpoint, { token: CANARY, accountId: bad }, options),
      { code: 'bad-credential' },
      JSON.stringify(bad),
    );
  assert.equal(sent.length, 2, 'a refused credential never reaches the network');
});
