import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stripVTControlCharacters } from 'node:util';
import { visibleWidth } from '@earendil-works/pi-tui';
import { parseTarget } from '../src/core/click-targets.js';
import { portableGlyphs } from '../src/ui/glyphs.js';
import { layoutFooter } from '../src/ui/layout.js';
import { NOW, SCENARIOS, paint } from './support/layout-matrix.js';
import type { Scenario } from './support/layout-matrix.js';

const layout = (scenario: Scenario, width: number) =>
  layoutFooter(scenario.snapshot, width, {
    paint,
    glyphs: portableGlyphs,
    now: NOW,
    ...(scenario.config ? { config: scenario.config } : {}),
    ...(scenario.expanded ? { quotaExpanded: true } : {}),
  });
const WIDTHS = Array.from({ length: 240 }, (_, index) => index + 1);
const each = (check: (scenario: Scenario, width: number) => void): void => {
  for (const scenario of SCENARIOS) for (const width of WIDTHS) check(scenario, width);
};
const where = (scenario: Scenario, width: number): string => `${scenario.name} @ ${width}`;

await test('invariant 1: no row is wider than the terminal, and there are always two rows', () => {
  each((scenario, width) => {
    const { lines } = layout(scenario, width);
    assert.equal(lines.length, 2, where(scenario, width));
    for (const line of lines)
      assert.ok(visibleWidth(line) <= width, `${where(scenario, width)}: ${visibleWidth(line)}`);
  });
});

await test('invariant 4: no row starts or ends with a separator and no separator doubles', () => {
  each((scenario, width) => {
    for (const line of layout(scenario, width).lines) {
      const text = stripVTControlCharacters(line).trim();
      assert.doesNotMatch(text, /^│|│$/u, `${where(scenario, width)}: dangling: ${text}`);
      assert.doesNotMatch(text, /│\s*│/u, `${where(scenario, width)}: doubled: ${text}`);
    }
  });
});

const ONE_ITEM = new Set(['context|context-usage', 'quota|quota-more']);
const MOVED = 'slots moved';

function regionsOf(scenario: Scenario, width: number, row: number) {
  return layout(scenario, width)
    .hitRegions.filter((region) => region.y === row)
    .sort((a, b) => a.x - b.x);
}
function glued(scenario: Scenario, width: number): string[] {
  const found: string[] = [];
  for (const row of [0, 1]) {
    const regions = regionsOf(scenario, width, row);
    regions.slice(1).forEach((next, index) => {
      const before = regions[index];
      if (!before || before.x + before.width !== next.x) return;
      const a = parseTarget(before.target).id;
      const b = parseTarget(next.target).id;
      if (a !== b && !ONE_ITEM.has(`${a}|${b}`)) found.push(`${a} / ${b}`);
    });
  }
  return found;
}

await test('invariant 8: click regions lie inside the row and do not overlap', () => {
  each((scenario, width) => {
    const { hitRegions } = layout(scenario, width);
    for (const region of hitRegions) {
      assert.ok(region.x >= 0 && region.width > 0, `${where(scenario, width)}: ${region.target}`);
      assert.ok(region.x + region.width <= width, `${where(scenario, width)}: ${region.target}`);
      assert.ok(region.y === 0 || region.y === 1, where(scenario, width));
    }
    for (const row of [0, 1]) {
      const regions = regionsOf(scenario, width, row);
      regions.slice(1).forEach((next, index) => {
        const before = regions[index];
        if (before)
          assert.ok(
            before.x + before.width <= next.x,
            `${where(scenario, width)}: ${before.target} / ${next.target}`,
          );
      });
    }
  });
});

await test('invariant 4b: no two items are glued in the stock arrangements', () => {
  for (const scenario of SCENARIOS.filter((s) => !s.name.startsWith(MOVED)))
    for (const width of WIDTHS)
      assert.deepEqual(glued(scenario, width), [], where(scenario, width));
});

await test('invariant 4b: no two items are glued after slots are moved', () => {
  for (const scenario of SCENARIOS.filter((s) => s.name.startsWith(MOVED)))
    for (const width of WIDTHS)
      assert.deepEqual(glued(scenario, width), [], where(scenario, width));
});

const quotaWindows = (scenario: Scenario, width: number): number =>
  (stripVTControlCharacters(layout(scenario, width).lines[1] ?? '').match(/\d+% left/gu) ?? [])
    .length;
const scenario = (name: string): Scenario => {
  const found = SCENARIOS.find((candidate) => candidate.name.startsWith(name));
  if (!found) throw new Error(`no scenario ${name}`);
  return found;
};
const withoutSpeed = (base: Scenario): Scenario => ({
  ...base,
  snapshot: { ...base.snapshot, outputTokensPerSecond: null },
});

await test('invariant 10: the speed value takes a fixed footprint and changes nothing else', () => {
  for (const name of ['speed shown, three', 'month hidden, speed shown']) {
    const shown = scenario(name);
    const regions = layout(shown, 240).hitRegions.filter((r) => r.y === 1);
    const speed = regions.filter((r) => parseTarget(r.target).id === 'speed');
    assert.ok(speed.length > 0, `${name}: the speed is shown at 240`);
    const footprint = speed.reduce((sum, r) => sum + r.width, 0) + 3;
    for (let width = 60; width <= 240; width += 1) {
      const row = stripVTControlCharacters(layout(shown, width).lines[1] ?? '');
      if (!row.includes('tok/s')) continue;
      assert.equal(
        quotaWindows(shown, width),
        quotaWindows(withoutSpeed(shown), width - footprint),
        `${where(shown, width)}: the quota differs from the row without speed, ${footprint} columns narrower`,
      );
    }
  }
});

await test('invariant 2 (observable): a wider terminal never shows fewer quota windows', () => {
  for (const shown of SCENARIOS.filter((s) => !s.expanded)) {
    let before = 0;
    for (const width of WIDTHS) {
      const now = quotaWindows(shown, width);
      if (width >= 60) assert.ok(now >= before, `${where(shown, width)}: ${now} after ${before}`);
      if (width >= 60) before = now;
    }
  }
});

await test('very wide terminals: no overflow, no cap, the same content as at 300 columns', () => {
  const squeeze = (text: string): string => text.replace(/\s{4,}/gu, ' … ');
  const content = (scenario: Scenario, width: number): string =>
    layout(scenario, width)
      .lines.map((line) => squeeze(stripVTControlCharacters(line)))
      .join('|');
  for (const scenario of SCENARIOS) {
    const reference = content(scenario, 300);
    for (const width of [320, 400, 500, 800, 1000, 1500, 2000]) {
      const wide = layout(scenario, width);
      assert.equal(wide.lines.length, 2, where(scenario, width));
      for (const line of wide.lines) {
        assert.ok(visibleWidth(line) <= width, `${where(scenario, width)}: too wide`);
        assert.doesNotMatch(stripVTControlCharacters(line).trim(), /^│|│$|│\s*│/u);
      }
      for (const region of wide.hitRegions)
        assert.ok(region.x >= 0 && region.x + region.width <= width, where(scenario, width));
      assert.equal(
        content(scenario, width),
        reference,
        `${where(scenario, width)}: content changed`,
      );
    }
  }
});
