import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AssistantMessage } from '@earendil-works/pi-ai';
import { ResponseTelemetry } from '../src/adapters/response-telemetry.js';

function message(overrides: Partial<AssistantMessage> = {}): AssistantMessage {
  return {
    role: 'assistant',
    api: 'openai-responses',
    provider: 'fixture',
    model: 'fixture',
    content: [],
    timestamp: 1,
    durationMs: 1000,
    stopReason: 'stop',
    usage: {
      input: 100,
      output: 25,
      cacheRead: 800,
      cacheWrite: 100,
      totalTokens: 1025,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    ...overrides,
  };
}

await test('primary telemetry rejects unpaired/stale completions and resets on context changes', () => {
  const telemetry = new ResponseTelemetry();
  telemetry.complete(message());
  assert.equal(telemetry.snapshot(undefined).cacheUsage, null);
  telemetry.start();
  telemetry.complete(message());
  assert.equal(telemetry.snapshot(undefined).outputTokensPerSecond, 25);
  assert.equal(telemetry.snapshot(undefined).cacheUsage?.reusePercent, 80);
  telemetry.reset();
  telemetry.complete(message());
  assert.equal(telemetry.snapshot(undefined).cacheUsage, null);
  assert.equal(telemetry.snapshot(undefined).responseTiming, null);
});

await test('cache last-completed sample is explicit and errors/aborts never replace it', () => {
  const telemetry = new ResponseTelemetry();
  telemetry.start();
  telemetry.complete(message());
  for (const stopReason of ['error', 'aborted', 'deferred'] as const) {
    telemetry.start();
    telemetry.complete(message({ stopReason }));
    const sample = telemetry.snapshot(undefined);
    assert.equal(sample.outputTokensPerSecond, null);
    assert.equal(sample.cacheUsage?.read, 800);
  }
});

await test('missing timing hides rate without discarding factual cache counters', () => {
  const telemetry = new ResponseTelemetry();
  const untimed = message();
  delete untimed.durationMs;
  telemetry.start();
  telemetry.complete(untimed);
  const sample = telemetry.snapshot({ short: 300, long: 3600 });
  assert.equal(sample.outputTokensPerSecond, null);
  assert.equal(sample.cacheUsage?.reusePercent, 80);
  assert.deepEqual(sample.cachePolicy, { short: 300, long: 3600 });
});

await test('malformed third-party usage cannot throw or turn into invented counters', () => {
  const telemetry = new ResponseTelemetry();
  const broken = message();
  Reflect.set(broken, 'usage', undefined);
  telemetry.start();
  assert.doesNotThrow(() => {
    telemetry.complete(broken);
  });
  const sample = telemetry.snapshot(undefined);
  assert.equal(sample.outputTokensPerSecond, null);
  assert.ok(sample.cacheUsage);
  assert.equal(sample.cacheUsage.read, null);
  assert.equal(sample.cacheUsage.reusePercent, null);
});

await test('returned telemetry snapshots cannot mutate live observations or retain response content', () => {
  const telemetry = new ResponseTelemetry();
  telemetry.start();
  telemetry.complete(message({ content: [{ type: 'text', text: 'not retained' }] }));
  const sample = telemetry.snapshot(undefined);
  assert.ok(sample.cacheUsage && sample.responseTiming);
  sample.cacheUsage.read = 1;
  sample.responseTiming.rate = 1;
  const next = telemetry.snapshot(undefined);
  assert.equal(next.cacheUsage?.read, 800);
  assert.equal(next.responseTiming?.rate, 25);
  assert.ok(!JSON.stringify(next).includes('retained'));
});

await test('a response that did not finish successfully never replaces the cache sample, whatever the timing says', () => {
  const telemetry = new ResponseTelemetry();
  telemetry.start();
  telemetry.complete(message());
  const untimedFailure = message({ stopReason: 'error' });
  delete untimedFailure.durationMs;
  telemetry.start();
  telemetry.complete(untimedFailure);
  assert.equal(telemetry.snapshot(undefined).cacheUsage?.read, 800);
});

await test('a finished response without a duration still records its cache counters', () => {
  const telemetry = new ResponseTelemetry();
  const untimed = message();
  delete untimed.durationMs;
  telemetry.start();
  telemetry.complete(untimed);
  const sample = telemetry.snapshot(undefined);
  assert.equal(sample.outputTokensPerSecond, null);
  assert.equal(sample.cacheUsage?.read, 800);
});
