import assert from 'node:assert/strict';
import { test } from 'node:test';
import { quotaSourceFor, quotaSources } from '../src/quota-sources/registry.js';

/** Hostile and malformed bodies: every parser must refuse them quietly, whatever the provider. */
const hostile: unknown[] = [
  undefined,
  null,
  0,
  'text',
  [],
  {},
  { data: null },
  { data: { limits: 'x' } },
  { usage: [] },
  { rate_limit: null },
  JSON.parse('{"__proto__":{"polluted":true},"data":{"limits":[{"type":"five_hour"}]}}'),
  { data: { limits: Array.from({ length: 10_000 }, () => ({ type: 'weekly', percentUsed: 1 })) } },
];

await test('every source is well formed: one pinned HTTPS origin, a plain path, a unique provider', () => {
  const seen = new Set<string>();
  for (const source of quotaSources) {
    assert.match(source.provider, /^[a-z0-9][a-z0-9-]*$/u, source.provider);
    assert.ok(!seen.has(source.provider), `${source.provider} is listed once`);
    seen.add(source.provider);
    const origin = new URL(source.origin);
    assert.equal(origin.protocol, 'https:', `${source.provider} is HTTPS`);
    assert.equal(
      origin.origin,
      source.origin,
      `${source.provider}: an origin, no path or userinfo`,
    );
    assert.match(source.path, /^\/[\w/.-]+$/u, `${source.provider}: a plain path, no query`);
    assert.ok(source.label.length > 0 && source.label.length <= 24);
    assert.equal(typeof source.parse, 'function');
  }
  assert.ok(quotaSources.length >= 3);
});

await test('every parser refuses hostile bodies without throwing or inventing windows', () => {
  for (const source of quotaSources) {
    for (const body of hostile) {
      const windows = source.parse(body);
      assert.ok(windows === undefined || windows.length <= 8, `${source.provider} stays bounded`);
      for (const window of windows ?? []) {
        assert.ok(window.remainingPercent >= 0 && window.remainingPercent <= 100);
        assert.ok(Number.isFinite(window.resetAt));
      }
    }
    assert.equal(({} as Record<string, unknown>).polluted, undefined, 'no prototype pollution');
  }
});

await test('lookup is by provider id only, and API-key providers have no source', () => {
  assert.equal(quotaSourceFor('openai-codex')?.label, 'Codex');
  assert.equal(quotaSourceFor('clinepass')?.label, 'ClinePass');
  assert.equal(quotaSourceFor('opencode-go')?.label, 'OpenCode Go');
  for (const none of [undefined, '', 'openai', 'anthropic', '__proto__', 'constructor'])
    assert.equal(quotaSourceFor(none), undefined, String(none));
});

await test("only Codex needs its own credential rule; the rest use Pi's token by default", () => {
  assert.deepEqual(
    quotaSources
      .filter((source) => source.credential !== undefined)
      .map((source) => source.provider),
    ['openai-codex'],
  );
});
