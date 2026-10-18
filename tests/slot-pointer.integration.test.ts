import assert from 'node:assert/strict';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { TuiAltScreen, VStack } from '@earendil-works/pi-tui';
import { DockFooter } from '../src/ui/footer.js';
import { layoutFooter } from '../src/ui/layout.js';
import { parseFooterConfig } from '../src/core/footer-config.js';
import { portableGlyphs } from '../src/ui/glyphs.js';
import { demoSnapshot } from './reference.js';
import { MemoryTerminal } from './support/terminal.js';

/** Every target a click can land on: items, and the icon token of items whose icon acts. */
const EXPECTED_TARGETS = new Set([
  'context',
  'speed',
  'custom',
  'workspace:icon',
  'workspace',
  'input',
  'model:icon',
  'model',
]);

await test('shared fullscreen dispatcher activates every configured slot cell, including wide text and right columns, not gutters', async () => {
  const terminal = new MemoryTerminal();
  const tui = new TuiAltScreen(terminal);
  const config = parseFooterConfig({
    rows: [
      { left: ['context', 'speed', 'custom'], right: ['cost'] },
      { left: ['workspace', 'input'], right: ['model'] },
    ],
    slots: { custom: { icon: '界', text: '{icon} Custom' } },
  });
  const snapshot = { ...demoSnapshot, outputTokensPerSecond: 12.3 };
  const options = { paint: (text: string) => text, glyphs: portableGlyphs, config };
  const activated: string[] = [];
  const footer = new DockFooter({
    ...options,
    configuration: () => config,
    snapshot: () => snapshot,
    dispose: () => {
      /* No owned fixture resources. */
    },
    isInteractive: () => true,
    onActivate: (target) => activated.push(target),
  });
  tui.setLayoutRoot(
    new VStack([
      {
        render: () => ['header', 'header', 'header'],
        invalidate: () => {
          /* No cache. */
        },
      },
      footer,
    ]),
  );
  tui.start();
  try {
    await delay(35);
    const layout = layoutFooter(snapshot, terminal.columns, options);
    for (const y of [0, 1]) {
      for (let x = 0; x < terminal.columns; x += 1) {
        const region = layout.hitRegions.find(
          (item) => item.y === y && x >= item.x && x < item.x + item.width,
        );
        const before = activated.length;
        const previousTarget = activated.at(-1);
        terminal.send(`\u001b[<0;${x + 1};${y + 4}M`);
        terminal.send(`\u001b[<0;${x + 1};${y + 4}m`);
        assert.equal(activated.length, before + (region ? 1 : 0), `cell ${x},${y}`);
        assert.equal(activated.at(-1), region?.target ?? previousTarget);
      }
    }
    assert.deepEqual(new Set(activated), EXPECTED_TARGETS);
  } finally {
    footer.dispose();
    tui.stop();
  }
});
