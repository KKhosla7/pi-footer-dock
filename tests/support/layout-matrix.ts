import { stripVTControlCharacters } from 'node:util';
import { demoSnapshot, withCost } from '../reference.js';
import { QUOTA_TOGGLE, defaultFooterConfig } from '../../src/core/footer-config.js';
import type { FooterConfig } from '../../src/core/footer-config.js';
import type { Snapshot } from '../../src/core/model.js';
import { portableGlyphs } from '../../src/ui/glyphs.js';
import { layoutFooter } from '../../src/ui/layout.js';
import { createPaint } from '../../src/ui/palette.js';

/** Scenarios and widths shared by the golden matrix and the layout property tests. */
export const paint = createPaint({
  fg: (_color, text) => text,
  bold: (text) => text,
  underline: (text) => text,
});
export const NOW = 4_000_000_000_000;

const speed = (value: number): Snapshot => ({ ...withCost, outputTokensPerSecond: value });
const withConfig = (patch: FooterConfig['slots']): FooterConfig => ({
  ...defaultFooterConfig(),
  slots: patch,
});
const windows = (labels: string[]): Snapshot => ({
  ...speed(84.2),
  rateLimits: {
    provider: 'clinepass',
    model: 'm',
    windows: demoSnapshot.rateLimits?.windows.filter((w) => labels.includes(w.label)) ?? [],
  },
});

export interface Scenario {
  name: string;
  snapshot: Snapshot;
  config?: FooterConfig;
  expanded?: boolean;
}
export const SCENARIOS: Scenario[] = [
  { name: 'default, three windows, no speed', snapshot: withCost },
  { name: 'speed shown, three windows', snapshot: speed(84.2) },
  {
    name: 'month hidden, speed shown (the reported flicker)',
    snapshot: speed(84.2),
    config: withConfig({ quota: { hideWindows: ['month'] } }),
  },
  {
    name: 'month hidden, speed absent',
    snapshot: withCost,
    config: withConfig({ quota: { hideWindows: ['month'] } }),
  },
  { name: 'week and month only, speed shown', snapshot: windows(['week', 'month']) },
  { name: 'month only, speed shown', snapshot: windows(['month']) },
  { name: 'expanded quota, speed shown', snapshot: speed(84.2), expanded: true },
  {
    name: 'collapsedShow 5h and week',
    snapshot: speed(84.2),
    config: withConfig({ quota: { collapsedShow: ['5h', 'week'] } }),
  },
  {
    name: 'collapsedShow names a window the provider did not send',
    snapshot: windows(['week', 'month']),
    config: withConfig({ quota: { collapsedShow: ['5h'] } }),
  },
  {
    name: 'collapse always',
    snapshot: speed(84.2),
    config: withConfig({ quota: { collapse: 'always' } }),
  },
  {
    name: 'slots moved: context after the git items on row 1',
    snapshot: speed(84.2),
    config: {
      version: 1,
      slots: {},
      rows: [
        {
          left: ['workspace', 'branch', 'changes', 'ahead', 'context', 'context-usage'],
          right: ['model', 'thinking'],
        },
        {
          left: ['compaction', 'input', 'output', 'cache', 'speed'],
          right: ['quota', QUOTA_TOGGLE, 'cost'],
        },
      ],
    },
  },
];
export const WIDTHS = [30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 160, 180, 200, 240];

export function render(scenario: Scenario, width: number): string[] {
  const layout = layoutFooter(scenario.snapshot, width, {
    paint,
    glyphs: portableGlyphs,
    now: NOW,
    ...(scenario.config ? { config: scenario.config } : {}),
    ...(scenario.expanded ? { quotaExpanded: true } : {}),
  });
  return layout.lines.map((line) => stripVTControlCharacters(line).trimEnd());
}
