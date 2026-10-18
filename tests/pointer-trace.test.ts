import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DockFooter } from '../src/ui/footer.js';
import { portableGlyphs } from '../src/ui/glyphs.js';
import type { TuiMouseEvent } from '@earendil-works/pi-tui';
import { demoSnapshot } from './reference.js';

await test('disabled pointer tracing does not construct diagnostic-only metadata', () => {
  let enabled = false;
  let calls = 0;
  const footer = new DockFooter({
    paint: (text) => text,
    glyphs: portableGlyphs,
    snapshot: () => demoSnapshot,
    dispose: () => {
      /* No fixture resources. */
    },
    trace: () => {
      calls += 1;
    },
    traceEnabled: () => enabled,
    isInteractive: () => true,
    onActivate: () => {
      /* Metadata-only fixture. */
    },
  });
  const event: TuiMouseEvent = {
    type: 'press',
    button: 'left',
    x: 1,
    y: 1,
    width: 140,
    height: 2,
    shift: false,
    alt: false,
    ctrl: false,
    screenY: 1,
    get screenX(): number {
      throw new Error('diagnostic metadata constructed');
    },
  };
  footer.render(140);
  assert.doesNotThrow(() => {
    footer.handleMouse(event);
  });
  assert.equal(calls, 0);
  enabled = true;
  assert.throws(() => footer.handleMouse(event), /diagnostic metadata constructed/u);
  enabled = false;
  footer.dispose();
  assert.equal(calls, 0);
});

await test('pointer diagnostics identify rejection layer and deduplicate unchanged render geometry', () => {
  const records: Record<string, unknown>[] = [];
  const footer = new DockFooter({
    paint: (text) => text,
    glyphs: portableGlyphs,
    snapshot: () => demoSnapshot,
    dispose: () => {
      /* No fixture resources. */
    },
    trace: (record) => records.push(record),
    isInteractive: () => false,
  });
  for (let index = 0; index < 100; index += 1) footer.render(140);
  assert.equal(records.length, 1, 'no trace-on-render feedback loop');
  const event: TuiMouseEvent = {
    type: 'press',
    button: 'left',
    x: 1,
    y: 1,
    screenX: 6,
    screenY: 11,
    width: 140,
    height: 2,
    shift: false,
    alt: false,
    ctrl: false,
  };
  footer.handleMouse(event);
  assert.equal(records.at(-1)?.reason, 'action-unavailable');
  assert.equal(records.at(-1)?.originX, 5);
  assert.equal(records.at(-1)?.originY, 10);
  assert.equal(records.at(-1)?.renderVersion, 100);
  footer.handleMouse({ ...event, x: 2 });
  assert.equal(records.at(-1)?.target, 'context-usage');
  assert.equal(records.at(-1)?.reason, 'action-unavailable');
  footer.handleMouse({ ...event, y: 2 });
  assert.equal(records.at(-1)?.reason, 'outside-target');
  footer.invalidate();
  footer.handleMouse(event);
  assert.equal(records.at(-1)?.reason, 'stale-width-or-invalidated');
  footer.render(100);
  assert.equal(records.at(-1)?.event, 'geometry');
  footer.dispose();
  footer.handleMouse(event);
  assert.equal(records.at(-1)?.reason, 'disposed');
});
