import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readSnapshot, readTotals } from '../src/adapters/snapshot.js';
import type { SnapshotSource } from '../src/adapters/snapshot.js';
import { unknownGit } from '../src/adapters/git.js';
import { formatTokens, safeLabel } from '../src/core/model.js';

const source: SnapshotSource = {
  cwd: '/tmp/project',
  model: undefined,
  getContextUsage: () => ({ tokens: 100_000, contextWindow: 272_000, percent: 100_000 / 2720 }),
  sessionManager: { getEntries: () => [] },
};

await test('live capacity and effective compaction reserve are used (not screenshot values)', () => {
  const snapshot = readSnapshot(
    source,
    { getSettings: () => ({ compaction: { reserveTokens: 20_000 } }) },
    unknownGit,
  );
  assert.equal(snapshot.capacity, 272_000);
  assert.equal(snapshot.tokens, 100_000);
  assert.equal(snapshot.compactRemaining, 152_000);
  assert.equal(snapshot.autoCompact, true);
});

await test('model-specific reserves override ordinary settings and unknown tokens remain unknown', () => {
  const model: NonNullable<SnapshotSource['model']> = {
    id: 'gpt-test',
    provider: 'openai-codex',
    name: 'Test',
    api: 'openai-codex-responses',
    baseUrl: 'https://example.invalid',
    input: ['text'],
    reasoning: true,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 272_000,
    maxTokens: 16_384,
  };
  const getSettings = () => ({
    compaction: {
      reserveTokens: 20_000,
      modelOverrides: { 'openai-codex/gpt-test': { reserveTokens: 50_000 } },
    },
  });
  assert.equal(
    readSnapshot({ ...source, model }, { getSettings }, unknownGit).compactRemaining,
    122_000,
  );
  const afterCompact = readSnapshot(
    {
      ...source,
      model,
      getContextUsage: () => ({ tokens: null, percent: null, contextWindow: 272_000 }),
    },
    { getSettings },
    unknownGit,
  );
  assert.equal(afterCompact.capacity, 272_000);
  assert.equal(afterCompact.tokens, null);
  assert.equal(afterCompact.compactRemaining, null);
});

await test('unknown context and disabled compaction remain honest', () => {
  const snapshot = readSnapshot(
    { ...source, getContextUsage: () => undefined },
    { getSettings: () => ({ compaction: { enabled: false } }) },
    unknownGit,
  );
  assert.equal(snapshot.tokens, null);
  assert.equal(snapshot.percent, null);
  assert.equal(snapshot.capacity, null);
  assert.equal(snapshot.compactRemaining, null);
  assert.equal(snapshot.autoCompact, false);
});

await test('totals include non-conversation model usage entries', () => {
  const usage = {
    input: 10,
    output: 3,
    cacheRead: 5,
    cacheWrite: 0,
    totalTokens: 18,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.5 },
  };
  const totals = readTotals([
    {
      type: 'usage',
      id: 'x',
      parentId: null,
      timestamp: '',
      kind: 'cache_warm',
      provider: 'test',
      model: 'test',
      usage,
    },
  ]);
  assert.deepEqual(totals, { input: 10, output: 3, cacheRead: 5, cacheWrite: 0, cost: 0.5 });
});

await test('formatting, placement validation and unsafe labels', () => {
  assert.equal(formatTokens(null), '—');
  assert.equal(formatTokens(77_000_000), '77.0M');
  assert.equal(formatTokens(723_000_000), '723M');
  assert.equal(formatTokens(272_000), '272k');
  assert.equal(safeLabel('abc\u001b\n\u202edef'), 'abcdef');
});

await test('the compaction point is a rounded-down percent of the window and follows model and reserve', () => {
  const at = (contextWindow: number | undefined, reserveTokens?: number) =>
    readSnapshot(
      {
        ...source,
        getContextUsage: () => ({ tokens: 10, percent: 0, contextWindow: contextWindow ?? 0 }),
      },
      { getSettings: () => (reserveTokens === undefined ? {} : { compaction: { reserveTokens } }) },
      unknownGit,
    ).compactAt;
  assert.equal(at(1_000_000), 98, 'default reserve 16384 of 1M is 98.36%, shown as 98');
  assert.equal(at(272_000, 20_000), 92);
  assert.equal(at(200_000, 0), 100);
  assert.equal(at(8_000, 16_384), 0, 'a reserve above the window compacts from the start');
  assert.equal(at(8_000, 8_000), 0);
});

await test('without a known window there is no compaction point, and usage is not needed for it', () => {
  const none = readSnapshot(
    { ...source, getContextUsage: () => undefined },
    { getSettings: () => ({}) },
    unknownGit,
  );
  assert.equal(none.compactAt, null);
  const afterCompact = readSnapshot(
    { ...source, getContextUsage: () => ({ tokens: null, percent: null, contextWindow: 200_000 }) },
    { getSettings: () => ({ compaction: { reserveTokens: 20_000 } }) },
    unknownGit,
  );
  assert.equal(afterCompact.compactRemaining, null);
  assert.equal(afterCompact.compactAt, 90);
});
