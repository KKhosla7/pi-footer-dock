import assert from 'node:assert/strict';
import { test } from 'node:test';
import { visibleWidth } from '@earendil-works/pi-tui';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { restoreRateLimits } from '../src/adapters/snapshot.js';
import { parseFooterConfig } from '../src/core/footer-config.js';
import { formatReset, parseCodexUsage, parseStoredRateLimits } from '../src/core/rate-limits.js';
import { quotaHelp } from '../src/core/quota-freshness.js';
import { layoutFooter } from '../src/ui/layout.js';
import { renderQuota } from '../src/ui/quota.js';
import { nerdGlyphs } from '../src/ui/glyphs.js';
import { demoSnapshot, withCost } from './reference.js';
import { modelFixture } from './fixtures.js';

const options = { paint: (text: string) => text, glyphs: nerdGlyphs, now: 4_000_000_000_000 };
await test('reset formatting carries rounded minutes into hours and days', () => {
  assert.equal(formatReset(7199, 0), '2h 0m');
  assert.equal(formatReset(86399, 0), '1d 0h');
  assert.equal(formatReset(60, 0), '1m');
  assert.equal(formatReset(0, 0), '0m');
});
await test('quota keeps age in help and budgets the compact stale suffix', () => {
  const snapshot = {
    ...demoSnapshot,
    provider: 'openai-codex',
    quotaStatus: 'quota stale',
    quotaFreshness: {
      ageMs: 120_000,
      receivedMono: performance.now(),
      observedAt: options.now - 120_000,
    },
  };
  const text = renderQuota(snapshot, options, {
    icon: nerdGlyphs.hourglass,
    budget: 1000,
    slot: {},
  });
  assert.match(text, /\(stale\)/u);
  assert.doesNotMatch(text, /old/u);
  for (let budget = 45; budget < 100; budget += 1) {
    const rendered = renderQuota(snapshot, options, {
      icon: nerdGlyphs.hourglass,
      budget,
      slot: {},
    });
    assert.ok(visibleWidth(rendered) <= budget);
  }
  assert.match(quotaHelp(snapshot, 'Codex'), /30 seconds/u);
  assert.match(quotaHelp(snapshot, 'Codex'), /2m old/u);
});
await test('configured quota and cost gaps retain both right-anchored slots when they fit', () => {
  for (const gap of [0, 1, 2, 3, 4, 5, 6]) {
    const config = parseFooterConfig({
      rows: [
        { left: [], right: [] },
        { left: [], right: ['quota', 'cost'] },
      ],
      slots: { quota: { gap }, cost: { gap } },
    });
    for (let width = 76; width < 140; width += 1) {
      const result = layoutFooter(withCost, width, { ...options, config });
      assert.ok(result.hitRegions.some((region) => region.target === 'quota'));
      assert.ok(result.hitRegions.some((region) => region.target === 'cost'));
      assert.equal(visibleWidth(result.lines[1] ?? ''), width);
    }
  }
});
await test('historical model-scoped values cannot cross a same-provider model change', () => {
  const model = modelFixture({
    provider: 'integration-a',
    id: 'new-model',
    api: 'openai-completions',
    contextWindow: 64000,
  });
  const entry = {
    type: 'custom',
    customType: 'pi-footer-dock-rate-limits-v1',
    data: {
      provider: 'integration-a',
      model: 'old-model',
      windows: [{ label: '5h', remainingPercent: 50, resetAt: 4_000_001_000 }],
    },
  };
  const ctx = {
    model,
    sessionManager: { getBranch: () => [entry] } as unknown as ExtensionContext['sessionManager'],
  };
  assert.equal(restoreRateLimits(ctx), null);
  entry.data.model = 'new-model';
  assert.equal(restoreRateLimits(ctx)?.model, 'new-model');
});
await test('untrusted extra windows and persisted window arrays are bounded', () => {
  const window = { used_percent: 40, limit_window_seconds: 7200, reset_at: 4_000_001_000 };
  const limits = parseCodexUsage('fixture', 'fixture', {
    rate_limits: { primary_window: window },
    additional_rate_limits: Array.from({ length: 10_000 }, (_, index) => ({
      rate_limit: {
        primary_window: { ...window, limit_window_seconds: 7200 + index },
      },
    })),
  });
  assert.ok((limits?.windows.length ?? 0) <= 8);
  assert.equal(
    parseStoredRateLimits({ provider: 'fixture', model: 'fixture', windows: Array(9).fill({}) }),
    undefined,
  );
});
