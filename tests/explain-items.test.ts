import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readCacheUsage } from '../src/core/cache-usage.js';
import { cache } from '../src/core/explain/items/cache.js';
import { compaction, contextUsage } from '../src/core/explain/items/context.js';
import { speed } from '../src/core/explain/items/speed.js';
import { defaultFooterConfig } from '../src/core/footer-config.js';
import { explainerFor } from '../src/core/explain/registry.js';
import { demoSnapshot } from './reference.js';
import { show } from './support/explain-show.js';

const totals = (cacheRead: number, cacheWrite = 0) => ({
  ...demoSnapshot.totals,
  input: 1_000,
  cacheRead,
  cacheWrite,
});

await test('every item in the default footer has an explainer that says what it reports', () => {
  const ids = defaultFooterConfig().rows.flatMap((row) => [...row.left, ...row.right]);
  for (const id of ids) {
    const explainer = explainerFor(id);
    assert.ok(explainer, `${id} has no explainer`);
    assert.ok(explainer.reports.length > 0 && explainer.missingWhen.length > 0, id);
  }
});

await test('cache: a healthy response shows the split, the share and measured writes where the API reports them', () => {
  const text = show(cache, {
    ...demoSnapshot,
    api: 'anthropic-messages',
    cacheUsage: readCacheUsage({ input: 100, cacheRead: 800, cacheWrite: 100 }),
    cachePolicy: { short: 300, long: 3600 },
    cacheIdleMs: 20_000,
    totals: totals(4_000, 300),
  });
  assert.match(text, /Last response\s+[█░┃▓▒]+\s+80% reused/u);
  assert.match(text, /read 800 80%.*uncached 100 10%.*written 100 10%/su);
  assert.match(text, /Read\s+800 tokens/u);
  assert.match(text, /Written\s+100 tokens/u);
  assert.match(text, /Idle before\s+20s/u);
  assert.match(text, /Lifetime\s+short ~5m, long ~1h/u);
  assert.match(text, /Reuse\s+\d+(\.\d)?%\s+4k read of/u);
});

await test('cache: a zero is a miss only after earlier reads, otherwise it is not reported', () => {
  const zero = readCacheUsage({ input: 2_700, cacheRead: 0, cacheWrite: 0 });
  const miss = show(cache, {
    ...demoSnapshot,
    api: 'openai-completions',
    cacheUsage: zero,
    totals: totals(113),
  });
  assert.match(
    miss,
    /Read\s+0 tokens\s+a miss: earlier responses in this session did report reads/u,
  );
  assert.match(miss, /Written\s+not reported\s+only some services behind this API send writes/u);
  assert.match(miss, /Now: available/u);
  const never = show(cache, {
    ...demoSnapshot,
    api: 'openai-completions',
    cacheUsage: zero,
    totals: totals(0),
  });
  assert.match(never, /has not reported any cache reads in this session/u);
  assert.match(never, /Now: the provider has not reported cache reads/u);
  assert.match(never, /Last response\s+░+\s+not reported/u);
});

await test('cache: writes are described by what the API can report, never as a measured zero where it cannot', () => {
  const zero = readCacheUsage({ input: 100, cacheRead: 800, cacheWrite: 0 });
  const write = (api: string | undefined) =>
    show(cache, {
      ...demoSnapshot,
      ...(api ? { api } : {}),
      cacheUsage: zero,
      totals: totals(800),
    });
  assert.match(write('anthropic-messages'), /Written\s+0 tokens\s+measured/u);
  assert.match(write('openai-completions'), /Written\s+not reported\s+only some services/u);
  assert.match(write('google-generative-ai'), /Written\s+not reported\s+this API does not report/u);
  assert.match(write(undefined), /whether this API reports writes is not known/u);
});

await test('cache: before any response the screen says there is nothing yet, and why', () => {
  const text = show(cache, { ...demoSnapshot, cacheUsage: null });
  assert.match(text, /waiting for a response/u);
  assert.match(text, /Now: no finished response yet/u);
  assert.match(text, /No response has finished since Pi started or the model changed/u);
});

await test('cache: the session share is read over all prompt tokens, not an average of percentages', () => {
  const snapshot = {
    ...demoSnapshot,
    cacheUsage: readCacheUsage({ input: 100, cacheRead: 0, cacheWrite: 0 }),
    totals: { ...demoSnapshot.totals, input: 1_000, cacheRead: 9_000, cacheWrite: 0 },
  };
  assert.match(show(cache, snapshot), /Reuse\s+90%\s+9k read of 10k prompt tokens/u);
});

await test('speed: the measurement is laid out and the missing case names its reason', () => {
  const timing = {
    output: 120,
    durationMs: 6000,
    rate: 20,
    reasoning: 30,
    firstContentMs: 5000,
    firstTextMs: null,
  };
  const text = show(speed, { ...demoSnapshot, outputTokensPerSecond: 20, responseTiming: timing });
  assert.match(text, /Last response\s+20\.0 tok\/s/u);
  assert.match(text, /Duration\s+6\.00 s/u);
  assert.match(text, /Reasoning\s+30 tokens\s+already counted in the output/u);
  assert.match(text, /First content\s+5\.00 s/u);
  assert.match(text, /First text\s+unavailable/u);
  const none = show(speed, { ...demoSnapshot, outputTokensPerSecond: null, responseTiming: null });
  assert.match(none, /Now: no finished response with usable timing/u);
  assert.match(none, /cleared when a turn starts/u);
});

await test('context and compaction: a meter, the numbers, and the table to choose another point', () => {
  const known = {
    ...demoSnapshot,
    capacity: 1_000_000,
    compactReserve: 16_384,
    compactAt: 98,
    tokens: 500_000,
    percent: 50,
  };
  assert.match(show(contextUsage, known), /Context\s+[█░]+\s+50% of 1\.0M/u);
  const text = show(compaction, { ...known, compactRemaining: 484_000 });
  assert.match(text, /To compaction\s+[█░]+\s+484k left/u);
  assert.match(text, /Compacts at\s+98% of the window\s+983\.6k tokens/u);
  assert.match(text, /50%\s+500k/u);
  assert.match(text, /90%\s+100k/u);
  assert.match(text, /compaction\.reserveTokens/u);
  assert.match(text, /cannot change it/u, 'honest that it cannot be set from here');
  const small = show(compaction, {
    ...known,
    capacity: 200_000,
    compactReserve: 20_000,
    compactAt: 90,
  });
  assert.match(small, /70%\s+60k/u);
  assert.match(small, /90% of the window/u);
});

await test('compaction without a known window invents no conversion', () => {
  for (const snapshot of [
    { ...demoSnapshot, capacity: null },
    { ...demoSnapshot, capacity: 1_000_000, compactAt: null, compactReserve: 1 },
  ]) {
    const text = show(compaction, snapshot);
    assert.match(text, /not known yet/u);
    assert.doesNotMatch(text, /Choose a different point/u);
  }
  assert.match(
    show(compaction, { ...demoSnapshot, autoCompact: false }),
    /Now: auto-compaction is off/u,
  );
});

await test('speed: a response the provider did not time says so, instead of leaving the figure unexplained', () => {
  const none = {
    ...demoSnapshot,
    outputTokensPerSecond: null,
    responseTiming: null,
    speedUnmeasured: 'no-duration' as const,
  };
  assert.match(show(speed, none), /provider reported no duration/u);
  assert.match(
    show(speed, { ...none, speedUnmeasured: null }),
    /no finished response with usable timing/u,
  );
});
