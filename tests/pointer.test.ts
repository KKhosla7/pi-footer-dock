import assert from 'node:assert/strict';
import { test } from 'node:test';
import { visibleWidth } from '@earendil-works/pi-tui';
import type { TuiMouseEvent } from '@earendil-works/pi-tui';
import { demoSnapshot } from './reference.js';
import { DockFooter } from '../src/ui/footer.js';
import { nerdGlyphs, portableGlyphs } from '../src/ui/glyphs.js';
import { layoutFooter } from '../src/ui/layout.js';
import type { Paint } from '../src/ui/palette.js';

const paint: Paint = (text) => text;
const noop = () => {
  /* No external resources in this fixture. */
};

function mouse(width: number, extra: Partial<TuiMouseEvent> = {}): TuiMouseEvent {
  return {
    type: 'click',
    button: 'left',
    x: 0,
    y: 1,
    screenX: 0,
    screenY: 1,
    width,
    height: 2,
    shift: false,
    alt: false,
    ctrl: false,
    ...extra,
  };
}

await test('only the rendered icon activates once per primary click; no focus or unrelated input', () => {
  let calls = 0;
  const footer = new DockFooter({
    paint,
    glyphs: portableGlyphs,
    snapshot: () => demoSnapshot,
    dispose: noop,
    isInteractive: (target) => target === 'context',
    onActivate: () => {
      calls += 1;
    },
  });
  footer.render(140);
  assert.deepEqual(footer.handleMouse(mouse(140, { type: 'press' })), {
    handled: true,
    render: false,
  });
  assert.equal(calls, 0);
  for (const type of ['release', 'move', 'drag', 'wheel'] as const) {
    assert.equal(footer.handleMouse(mouse(140, { type })), undefined);
  }
  for (const extra of [
    { x: 2 },
    { y: 0 },
    { y: 2 },
    { button: 'right' as const },
    { button: 'middle' as const },
    { ctrl: true },
    { shift: true },
  ])
    assert.equal(footer.handleMouse(mouse(140, extra)), undefined);
  assert.equal(calls, 0);
  assert.deepEqual(footer.handleMouse(mouse(140)), { handled: true, render: false });
  assert.equal(footer.handleMouse(mouse(140, { type: 'release' })), undefined);
  assert.equal(calls, 1);
  assert.ok(!('handleInput' in footer));
  footer.dispose();
  assert.equal(footer.handleMouse(mouse(140)), undefined);
});

await test('inactive slots are decorative; invalidation and stale resize rectangles never fire', () => {
  let available = false;
  let calls = 0;
  const footer = new DockFooter({
    paint,
    glyphs: portableGlyphs,
    snapshot: () => demoSnapshot,
    dispose: noop,
    isInteractive: (target) => target === 'context' && available,
    onActivate: () => {
      calls += 1;
    },
  });
  footer.render(140);
  assert.equal(footer.handleMouse(mouse(140)), undefined);
  available = true;
  assert.equal(footer.handleMouse(mouse(80)), undefined);
  footer.invalidate();
  assert.equal(footer.handleMouse(mouse(140)), undefined);
  footer.render(80);
  footer.handleMouse(mouse(80));
  assert.equal(calls, 1);
  footer.render(0);
  assert.equal(footer.handleMouse(mouse(0)), undefined);
  footer.dispose();
});

await test('final layout hit regions follow clipping, Nerd Font, fallback and wide glyph columns', () => {
  for (const glyphs of [nerdGlyphs, portableGlyphs, { ...portableGlyphs, chip: '界' }]) {
    const iconWidth = visibleWidth(glyphs.chip);
    for (let width = 0; width <= 220; width += 1) {
      const layout = layoutFooter(demoSnapshot, width, { paint, glyphs });
      for (const region of layout.hitRegions.filter((item) => item.target === 'context')) {
        assert.ok(region.width >= iconWidth);
        assert.ok(region.width <= iconWidth + 1);
        assert.equal(region.x, 0);
        assert.equal(region.y, 1);
        assert.ok(region.x + region.width <= width);
        assert.ok((layout.lines[1] ?? '').startsWith(glyphs.chip));
      }
      if (width < iconWidth)
        assert.deepEqual(
          layout.hitRegions.filter((item) => item.target === 'context'),
          [],
        );
    }
    const footer = new DockFooter({
      paint,
      glyphs,
      snapshot: () => demoSnapshot,
      dispose: noop,
      isInteractive: (target) => target === 'context',
      onActivate: noop,
    });
    footer.render(140);
    assert.ok(footer.handleMouse(mouse(140, { x: iconWidth - 1 }))?.handled);
    assert.ok(footer.handleMouse(mouse(140, { x: iconWidth }))?.handled);
    assert.equal(footer.handleMouse(mouse(140, { x: iconWidth + 1 })), undefined);
    footer.dispose();
  }
});
