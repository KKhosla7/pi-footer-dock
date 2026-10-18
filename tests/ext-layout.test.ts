import assert from 'node:assert/strict';
import { stripVTControlCharacters } from 'node:util';
import { test } from 'node:test';
import { visibleWidth } from '@earendil-works/pi-tui';
import { extensionEntries, parseRowId } from '../src/core/ext/menu.js';
import { ExtensionRegistry } from '../src/core/ext/registry.js';
import { withExtensionRows } from '../src/core/ext/rows.js';
import { defaultFooterConfig } from '../src/core/footer-config.js';
import { portableGlyphs } from '../src/ui/glyphs.js';
import { layoutFooter } from '../src/ui/layout.js';
import { demoSnapshot } from './reference.js';
import { registration } from './support/fake-registration.js';

const plainText = (line: string): string => stripVTControlCharacters(line);

await test("rows: items follow Footer Dock's own, a third row exists only when used, and an empty registry changes nothing", () => {
  const config = defaultFooterConfig();
  const registry = new ExtensionRegistry();
  assert.equal(withExtensionRows(config, registry), config);
  registry.register(registration());
  const merged = withExtensionRows(config, registry);
  assert.equal(merged.rows.length, 3);
  const [, second, third] = merged.rows;
  assert.ok(second && third);
  assert.equal(second.right.at(-1), 'acme:status');
  assert.deepEqual(
    second.right.slice(0, -1),
    config.rows.at(1)?.right,
    "Footer Dock's own come first",
  );
  assert.deepEqual(third, { left: ['acme:quiet'], right: [] });
  registry.register(
    registration({ items: [{ id: 'status', region: 'row1.left', at: { xl: { text: 'x' } } }] }),
  );
  assert.equal(withExtensionRows(config, registry).rows.length, 2);
});

await test('the footer draws registered items at every width, gives them up before its own essentials, and never overflows', () => {
  const registry = new ExtensionRegistry();
  registry.register(registration());
  const draw = (width: number) =>
    layoutFooter(demoSnapshot, width, {
      paint: (text) => text,
      glyphs: portableGlyphs,
      now: 4_000_000_000_000,
      extensions: registry,
    });
  const wide = draw(220);
  assert.equal(wide.lines.length, 3);
  assert.match(plainText(wide.lines[1] ?? ''), /• Acme: 3 jobs running\s*$/u);
  assert.match(plainText(wide.lines[2] ?? ''), /a third row/u);
  const medium = plainText(draw(120).lines.join('\n'));
  assert.match(medium, /• 3 jobs/u, 'a narrower look picks the form declared for it');
  for (let width = 16; width <= 260; width += 1)
    for (const line of draw(width).lines) assert.ok(visibleWidth(line) <= width, `width ${width}`);
  const tight = plainText(draw(48).lines.join('\n'));
  assert.doesNotMatch(
    tight,
    /Acme|jobs/u,
    "out of room, the extension item goes before Footer Dock's own",
  );
  assert.match(tight, /fedora/u, 'and the project name stays');
});

await test('an item whose icon takes clicks has the icon as a token of its own; otherwise the whole item is one target', () => {
  const registry = new ExtensionRegistry();
  registry.register(registration());
  const layout = layoutFooter(demoSnapshot, 220, {
    paint: (text) => text,
    glyphs: portableGlyphs,
    now: 4_000_000_000_000,
    extensions: registry,
  });
  const targets = layout.hitRegions.map((region) => region.target);
  assert.ok(targets.includes('acme:status:icon') && targets.includes('acme:status'));
  assert.ok(targets.includes('acme:quiet') && !targets.includes('acme:quiet:icon'));
});

await test('the settings group lists the registered rows, and a row id names the extension and the row', () => {
  const registry = new ExtensionRegistry();
  registry.register(registration());
  const [group] = extensionEntries(registry);
  assert.ok(group);
  assert.equal(group.label, 'Acme');
  assert.equal(group.current, 'all default');
  assert.deepEqual(
    group.children?.map((row) => row.id),
    ['ext:acme:mode'],
  );
  assert.deepEqual(parseRowId('ext:acme:mode'), { ext: 'acme', row: 'mode' });
  assert.equal(parseRowId('item:quota'), undefined);
  registry.setCurrent('acme', 'mode', 'full');
  assert.equal(extensionEntries(registry)[0]?.current, '1 changed');
  assert.equal(registry.setCurrent('acme', 'mode', 'nonsense'), false);
});
