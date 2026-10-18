import type { Snapshot } from '../src/core/model.js';

/** Test-only visual reference. Not imported by the extension runtime. */
export const demoSnapshot: Snapshot = {
  cwd: '/home/fixture/Projects/fedora-hyprland-workstation',
  home: '/home/fixture',
  git: { branch: 'main', changed: 2, ahead: 1 },
  tokens: 870_000,
  capacity: 1_000_000,
  percent: 87,
  compactRemaining: 112_000,
  autoCompact: true,
  totals: {
    input: 77_000_000,
    output: 2_300_000,
    cacheRead: 723_000_000,
    cacheWrite: 0,
    cost: 15.97,
  },
  provider: 'opencode-go',
  model: 'deepseek-v4.1-flash',
  thinking: 'high',
  rateLimits: {
    provider: 'openai-codex',
    model: 'deepseek-v4.1-flash',
    windows: [
      { label: '5h', remainingPercent: 34, resetAt: 4_000_008_100 },
      { label: 'week', remainingPercent: 48, resetAt: 4_000_295_200 },
      { label: 'month', remainingPercent: 18, resetAt: 4_001_209_600 },
    ],
  },
};

/** The reference footer with an API cost estimate, for tests of the cost slot (it hides without one). */
export const withCost: Snapshot = {
  ...demoSnapshot,
  apiCostEstimate: { amount: 1.23, responses: 3, unavailable: 0, coverage: 'complete' },
};
