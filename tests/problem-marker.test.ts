import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { stripVTControlCharacters } from 'node:util';
import { visibleWidth } from '@earendil-works/pi-tui';
import { problem } from '../src/core/problems.js';
import { defaultFooterConfig } from '../src/core/footer-config.js';
import { ProblemState } from '../src/problem-state.js';
import { DockFooter } from '../src/ui/footer.js';
import { portableGlyphs } from '../src/ui/glyphs.js';
import { layoutFooter } from '../src/ui/layout.js';
import { createPaint } from '../src/ui/palette.js';
import { ProblemBlink } from '../src/ui/problem-blink.js';
import { demoSnapshot } from './reference.js';

/** The problems marker, the blink, the problems screen. */
const NOW = 4_000_000_000_000;
const named = (color: string, text: string): string => `<${color}>${text}</${color}>`;
const tagged = createPaint({
  fg: (color, text) => named(color, text),
  bold: (text) => text,
  underline: (text) => text,
});
const plain = createPaint({
  fg: (_color, text) => text,
  bold: (text) => text,
  underline: (text) => text,
});
const problems = [
  problem(
    '~/.pi/agent/pi-footer-dock.json',
    'limits',
    'The value "maybe" is not accepted.',
    'Use on or off.',
  ),
  problem(
    '~/.pi/agent/pi-footer-dock.json',
    'shrink',
    'Unknown shrink step: drop:cots',
    'Did you mean drop:cost?',
  ),
];
const draw = (width: number, count: number, bright = true, paint = plain) =>
  layoutFooter(demoSnapshot, width, {
    paint,
    glyphs: portableGlyphs,
    now: NOW,
    ...(count > 0 ? { problems: { count, bright } } : {}),
  });

await test('the marker is first on the first row while problems exist, and absent otherwise', () => {
  const first = (count: number) => stripVTControlCharacters(draw(140, count).lines[0] ?? '');
  assert.match(first(2), /^ ?▲ 2 problems/u);
  assert.match(first(1), /^ ?▲ 1 problem\b/u);
  assert.doesNotMatch(first(0), /problem/u);
  assert.deepEqual(
    draw(140, 0).lines,
    layoutFooter(demoSnapshot, 140, { paint: plain, glyphs: portableGlyphs, now: NOW }).lines,
  );
});

await test('the marker is red while bright and dim in the other half of the blink', () => {
  const text = (bright: boolean) => draw(140, 2, bright, tagged).lines[0] ?? '';
  assert.match(text(true), /<error>▲ 2 problems<\/error>/u);
  assert.match(text(false), /<dim>▲ 2 problems<\/dim>/u);
});

await test('with the marker the footer is never wider than the terminal and the marker can be clicked', () => {
  for (let width = 1; width <= 240; width += 1) {
    const layout = draw(width, 3);
    for (const line of layout.lines) assert.ok(visibleWidth(line) <= width, `${width}`);
    for (const region of layout.hitRegions)
      assert.ok(region.x >= 0 && region.x + region.width <= width, `${width}`);
  }
  const regions = draw(120, 3).hitRegions.filter((region) => region.target === 'problems');
  const [marker] = regions;
  assert.equal(regions.length, 1);
  assert.ok(marker);
  assert.deepEqual([marker.x, marker.y], [0, 0]);
});

await test('the marker is never given up by the shrink plan: it survives down to narrow terminals', () => {
  for (let width = 30; width <= 240; width += 1)
    assert.match(
      stripVTControlCharacters(draw(width, 2).lines[0] ?? ''),
      /2 problems/u,
      `${width}`,
    );
});

await test('an alert lasts until the user has opened the screen, and a different list alerts again', () => {
  const state = new ProblemState();
  assert.equal(state.alerting, false);
  state.set(problems);
  assert.equal(state.alerting, true);
  state.acknowledge();
  assert.equal(state.alerting, false);
  state.set([...problems]);
  assert.equal(state.alerting, false, 'the same problems stay acknowledged');
  state.set(problems.slice(0, 1));
  assert.equal(state.alerting, true, 'a different list is new to the user');
  state.set([]);
  assert.equal(state.alerting, false);
  assert.equal(state.count, 0);
});

const blinking = (t: TestContext): { redraws: () => number; blink: ProblemBlink } => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let redraws = 0;
  return {
    blink: new ProblemBlink(() => {
      redraws += 1;
    }),
    redraws: () => redraws,
  };
};

await test('the blink runs at one beat per half second, only while it alerts, with one timer', (t) => {
  const { blink, redraws } = blinking(t);
  blink.update(true);
  blink.update(true);
  assert.equal(blink.bright, true);
  t.mock.timers.tick(500);
  assert.equal(blink.bright, false);
  t.mock.timers.tick(500);
  assert.equal(blink.bright, true);
  assert.equal(redraws(), 2, 'one timer, not two');
  blink.update(false);
  t.mock.timers.tick(5_000);
  assert.equal(redraws(), 2, 'nothing runs once it no longer alerts');
  assert.equal(blink.bright, true);
});

await test('stopping the blink leaves no timer and resets it to bright', (t) => {
  const { blink, redraws } = blinking(t);
  blink.update(true);
  t.mock.timers.tick(500);
  blink.stop();
  t.mock.timers.tick(5_000);
  assert.equal(redraws(), 1);
  assert.equal(blink.bright, true);
});

const footerWith = (state: ProblemState, redraw: () => void, quotaAnimation = true) => {
  const config = defaultFooterConfig();
  return new DockFooter({
    paint: plain,
    glyphs: portableGlyphs,
    now: NOW,
    snapshot: () => demoSnapshot,
    dispose: () => undefined,
    requestRender: redraw,
    problemState: () => state,
    configuration: () => ({
      ...config,
      slots: quotaAnimation ? {} : { quota: { animation: false } },
    }),
  });
};

await test('the footer shows the marker, blinks while it alerts, and stops once the screen was opened', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let redraws = 0;
  const state = new ProblemState();
  state.set(problems);
  const footer = footerWith(state, () => {
    redraws += 1;
  });
  assert.match(stripVTControlCharacters(footer.render(140)[0] ?? ''), /2 problems/u);
  t.mock.timers.tick(500);
  assert.equal(redraws, 1, 'it blinks while the user has not looked');
  state.acknowledge();
  footer.render(140);
  t.mock.timers.tick(5_000);
  assert.equal(redraws, 1, 'and stops once the problems screen was opened');
  assert.match(
    stripVTControlCharacters(footer.render(140)[0] ?? ''),
    /2 problems/u,
    'the marker stays',
  );
  footer.dispose();
});

await test('with the animation setting off the marker stays bright red and no timer runs; dispose stops the blink', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  let redraws = 0;
  const state = new ProblemState();
  state.set(problems);
  const still = footerWith(state, () => (redraws += 1), false);
  still.render(140);
  t.mock.timers.tick(5_000);
  assert.equal(redraws, 0);
  const moving = footerWith(state, () => (redraws += 1));
  moving.render(140);
  moving.dispose();
  t.mock.timers.tick(5_000);
  assert.equal(redraws, 0, 'no timer remains after dispose');
});
