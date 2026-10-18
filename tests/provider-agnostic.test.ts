import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { stripVTControlCharacters } from 'node:util';
import { readSnapshot } from '../src/adapters/snapshot.js';
import type { SnapshotSource } from '../src/adapters/snapshot.js';
import { unknownGit } from '../src/adapters/git.js';
import { layoutFooter } from '../src/ui/layout.js';
import { portableGlyphs } from '../src/ui/glyphs.js';
import { createPaint } from '../src/ui/palette.js';
import { assistantEntry, providerModels } from './fixtures.js';

const paint = createPaint({
  fg: (_color, text) => text,
  bold: (text) => text,
  underline: (text) => text,
});

await test('provider/model switches change capacity, compaction and labels without special cases', () => {
  const sessionManager = SessionManager.inMemory();
  for (const [index, model] of providerModels.entries()) {
    sessionManager.appendMessage(assistantEntry(model, String(index)).message);
    const source: SnapshotSource = {
      cwd: '/test',
      model,
      sessionManager,
      getContextUsage: () => ({
        contextWindow: model.contextWindow,
        tokens: 2_250,
        percent: (2_250 / model.contextWindow) * 100,
      }),
    };
    const reserveTokens = 1_000 + index;
    const settings = {
      getSettings: () => ({
        compaction: {
          reserveTokens: 2_000,
          modelOverrides: { [`${model.provider}/${model.id}`]: { reserveTokens } },
        },
      }),
    };
    const snapshot = readSnapshot(source, settings, unknownGit);
    assert.equal(snapshot.capacity, model.contextWindow);
    assert.equal(snapshot.compactRemaining, model.contextWindow - reserveTokens - 2_250);
    assert.deepEqual(snapshot.totals, {
      input: 1_500 * (index + 1),
      output: 250 * (index + 1),
      cacheRead: 500 * (index + 1),
      cacheWrite: 0,
      cost: 0,
    });
    assert.equal(snapshot.provider, model.provider);
    assert.equal(snapshot.model, model.id);
    const footer = layoutFooter(snapshot, 140, { paint, glyphs: portableGlyphs });
    assert.equal(footer.lines.length, 2);
    assert.ok(!stripVTControlCharacters(footer.lines[1] ?? '').includes('0% of'));
  }
});

await test('invalid context capacities never become a fabricated numeric window', () => {
  const baseModel = providerModels[0];
  assert.ok(baseModel);
  for (const capacity of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const source: SnapshotSource = {
      cwd: '/test',
      model: { ...baseModel, contextWindow: capacity },
      sessionManager: SessionManager.inMemory(),
      getContextUsage: () => undefined,
    };
    const snapshot = readSnapshot(source, { getSettings: () => ({}) }, unknownGit);
    assert.equal(snapshot.capacity, null);
    assert.equal(snapshot.percent, null);
    assert.equal(snapshot.compactRemaining, null);
  }
});

await test('empty sessions are zero; unavailable context after compaction is not zero', () => {
  const model = providerModels[0];
  assert.ok(model);
  const source: SnapshotSource = {
    cwd: '/test',
    model,
    sessionManager: SessionManager.inMemory(),
    getContextUsage: () => ({ tokens: 0, percent: 0, contextWindow: model.contextWindow }),
  };
  const settings = { getSettings: () => ({}) };
  const empty = readSnapshot(source, settings, unknownGit);
  assert.equal(empty.tokens, 0);
  assert.equal(empty.percent, 0);
  assert.deepEqual(empty.totals, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 });
  const unknown = readSnapshot(
    {
      ...source,
      getContextUsage: () => ({ tokens: null, percent: null, contextWindow: model.contextWindow }),
    },
    settings,
    unknownGit,
  );
  assert.equal(unknown.tokens, null);
  assert.equal(unknown.percent, null);
  assert.equal(unknown.compactRemaining, null);
});
