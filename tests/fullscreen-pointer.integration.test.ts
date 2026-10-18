import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createEventBus } from '@earendil-works/pi-coding-agent';
import {
  Container,
  HStack,
  TuiAltScreen,
  VStack,
  stripTerminalSequences,
  visibleWidth,
} from '@earendil-works/pi-tui';
import type { Component } from '@earendil-works/pi-tui';
import { DockFooter } from '../src/ui/footer.js';
import { actionChannels, UIActionRegistry } from '../src/core/ui-actions.js';
import { nerdGlyphs, portableGlyphs } from '../src/ui/glyphs.js';
import type { Glyphs } from '../src/ui/glyphs.js';
import { demoSnapshot } from './reference.js';
import { MemoryTerminal } from './support/terminal.js';

const sgr = (button: number, x: number, y: number, release = false) =>
  `\u001b[<${button};${x + 1};${y + 1}${release ? 'm' : 'M'}`;
const settle = () => delay(35);
const advertisement = {
  version: 1,
  id: 'independent.integration.details',
  target: 'context',
  label: 'Details',
};

const noop = () => {
  /* No external resources or render cache in fixture components. */
};

function fixture(glyphs: Glyphs) {
  const terminal = new MemoryTerminal();
  terminal.rows = 24;
  const tui = new TuiAltScreen(terminal);
  const bus = createEventBus();
  const registry = new UIActionRegistry(bus, new Set(['context']));
  const records: Record<string, unknown>[] = [];
  let calls = 0;
  let visible = false;
  const header: Component = {
    render: () => Array.from({ length: visible ? 6 : 3 }, () => 'header'),
    invalidate: noop,
  };
  const footer = new DockFooter({
    paint: (text) => text,
    glyphs,
    snapshot: () => demoSnapshot,
    dispose: noop,
    trace: (record) => records.push(record),
    isInteractive: (target) => target === 'context' && registry.actions(target).length > 0,
    onActivate: (target) => {
      registry
        .invoke(target, () => Promise.resolve(undefined))
        .catch(() => {
          assert.fail('fixture invocation rejected');
        });
    },
  });
  bus.on(actionChannels.discover, () => {
    bus.emit(actionChannels.register, advertisement);
  });
  bus.on(actionChannels.invoke, (data) => {
    assert.deepEqual(data, { version: 1, id: advertisement.id });
    calls += 1;
    visible = !visible;
    bus.emit(actionChannels.register, advertisement);
    tui.requestRender();
  });
  registry.start();
  // Real layout node offsets + a legacy forwarding container exercise both coordinate transforms.
  const container = new Container();
  container.addChild(footer);
  tui.setLayoutRoot(
    new HStack([
      { component: { render: () => [''], invalidate: noop }, basis: 5, shrink: 0 },
      { component: new VStack([header, container]), grow: 1 },
    ]),
  );
  tui.start();
  const point = () => {
    const y = tui
      .getScreenLines()
      .findIndex((line) => stripTerminalSequences(line).startsWith(`     ${glyphs.chip} `));
    assert.ok(y >= 0, 'visible footer in real fullscreen frame');
    return { x: 5, y };
  };
  const click = async (offset = 0, dy = 0, button = 0) => {
    const { x, y } = point();
    terminal.send(sgr(button, x + offset, y + dy));
    terminal.send(sgr(button, x + offset, y + dy, true));
    await settle();
  };
  return { terminal, tui, registry, bus, records, footer, point, click, count: () => calls };
}

await test('real fullscreen SGR path covers every icon/spacer cell, boundaries and parent offsets', async () => {
  for (const glyphs of [nerdGlyphs, portableGlyphs, { ...portableGlyphs, chip: '界' }]) {
    const f = fixture(glyphs);
    try {
      await settle();
      const targetWidth = visibleWidth(glyphs.chip) + 1;
      for (let x = 0; x < targetWidth; x += 1) {
        const before = f.count();
        const previousRow = f.point().y;
        await f.click(x);
        assert.equal(f.count(), before + 1, `target cell ${x}`);
        assert.notEqual(f.point().y, previousRow, 'widget moves the footer between clicks');
      }
      const before = f.count();
      for (const x of [-1, targetWidth, targetWidth + 1]) await f.click(x);
      for (let x = -1; x <= targetWidth; x += 1) {
        await f.click(x, -1);
        await f.click(x, 1);
      }
      assert.equal(f.count(), before, 'perimeter, meter, unrelated rows pass through');
      const clicks = f.records.filter((r) => r.event === 'click' && r.reason === 'handled');
      assert.equal(clicks.length, targetWidth);
      assert.ok(clicks.every((r) => r.originX === 5 && r.y === 1));
    } finally {
      f.footer.dispose();
      f.registry.stop();
      f.tui.stop();
    }
  }
});

await test('real fullscreen repeat/multi-click, idle, rerender, move/drag and resize lifecycle', async () => {
  const f = fixture(nerdGlyphs);
  try {
    await settle();
    for (let index = 0; index < 8; index += 1) await f.click(index % 2);
    await delay(500);
    f.tui.invalidate();
    f.tui.requestRender();
    await settle();
    await f.click();
    assert.equal(f.count(), 9);
    // Rapid double/triple clicks while a provider rerender is queued still dispatch once each.
    const { x, y } = f.point();
    for (let index = 0; index < 3; index += 1) {
      f.terminal.send(sgr(0, x, y));
      f.terminal.send(sgr(0, x, y, true));
    }
    await settle();
    assert.equal(f.count(), 12);
    assert.deepEqual(
      f.records
        .filter((r) => r.event === 'click')
        .slice(-3)
        .map((r) => r.clickCount),
      [1, 2, 3],
    );
    const p = f.point();
    f.terminal.send(sgr(0, p.x, p.y));
    f.terminal.send(sgr(32, p.x + 1, p.y));
    f.terminal.send(sgr(32, p.x, p.y));
    f.terminal.send(sgr(0, p.x, p.y, true));
    await settle();
    assert.equal(f.count(), 12, 'cross-cell motion suppresses click even after returning');
    for (const button of [1, 2, 4, 8, 16, 64]) await f.click(0, 0, button);
    assert.equal(f.count(), 12);
    f.terminal.send(sgr(0, p.x, p.y));
    f.terminal.resize(100, 24);
    await settle();
    f.terminal.send(sgr(0, p.x, p.y, true));
    await settle();
    assert.equal(f.count(), 12, 'retained pre-resize gesture rejected');
    await f.click(1);
    assert.equal(f.count(), 13, 'new geometry recovers');
    const same = f.point();
    f.terminal.send(sgr(0, same.x, same.y));
    f.terminal.send(sgr(32, same.x, same.y));
    f.terminal.send(sgr(0, same.x, same.y, true));
    await settle();
    assert.equal(f.count(), 14, 'motion that stays within one terminal cell still clicks');
    const held = f.point();
    f.terminal.send(sgr(0, held.x, held.y));
    f.tui.invalidate();
    f.tui.requestRender();
    await settle();
    f.terminal.send(sgr(0, held.x, held.y, true));
    await settle();
    assert.equal(f.count(), 15, 'same-geometry rerender during a held gesture preserves its click');
  } finally {
    f.footer.dispose();
    f.registry.stop();
    f.tui.stop();
  }
});

await test('registry removal/restart affects mouse and keyboard alike, with no idle expiry', async () => {
  const f = fixture(portableGlyphs);
  try {
    await settle();
    f.bus.emit(actionChannels.unregister, { version: 1, id: advertisement.id });
    await f.click();
    assert.equal(
      await f.registry.invoke('context', () => Promise.resolve(undefined)),
      'unavailable',
    );
    assert.equal(f.count(), 0);
    f.registry.start();
    await delay(100);
    await f.click(1);
    assert.equal(f.count(), 1);
    assert.equal(await f.registry.invoke('context', () => Promise.resolve(undefined)), 'invoked');
    assert.equal(f.count(), 2);
  } finally {
    f.footer.dispose();
    f.registry.stop();
    f.tui.stop();
  }
});
