import assert from 'node:assert/strict';
import { stripVTControlCharacters } from 'node:util';
import { visibleWidth } from '@earendil-works/pi-tui';
import { test } from 'node:test';
import { ICON_ACTION_IDS, iconTarget, parseTarget } from '../src/core/click-targets.js';
import { defaultFooterConfig } from '../src/core/footer-config.js';
import { nerdGlyphs, portableGlyphs } from '../src/ui/glyphs.js';
import { layoutFooter } from '../src/ui/layout.js';
import { renderSegment } from '../src/ui/segments.js';
import { demoSnapshot } from './reference.js';

const config = defaultFooterConfig();
const NOW = 4_000_000_000_000;

await test('a target names an item and whether it is the icon', () => {
  assert.deepEqual(parseTarget('workspace'), { id: 'workspace', icon: false });
  assert.deepEqual(parseTarget(iconTarget('workspace')), { id: 'workspace', icon: true });
  assert.deepEqual([...ICON_ACTION_IDS].sort(), [
    'ahead',
    'branch',
    'changes',
    'model',
    'thinking',
    'workspace',
  ]);
});

await test('for every item with an icon action the icon token is exactly the glyph and its space', () => {
  for (const glyphs of [portableGlyphs, nerdGlyphs]) {
    for (const [id, key] of [
      ['workspace', 'folder'],
      ['branch', 'branch'],
      ['changes', 'changed'],
      ['ahead', 'ahead'],
      ['model', 'robot'],
      ['thinking', 'reasoning'],
    ] as const) {
      const segment = renderSegment(
        id,
        demoSnapshot,
        { paint: (text) => text, glyphs, now: NOW },
        { config, look: 'xl' },
      );
      const chars = Array.from(stripVTControlCharacters(segment.text));
      const icon = glyphs[key];
      assert.ok(segment.iconWidth > 0, `${id} has an icon token`);
      let columns = 0;
      let taken = 0;
      while (columns < segment.iconWidth) columns += visibleWidth(chars[taken++] ?? '');
      assert.equal(columns, segment.iconWidth, `${id}: the token ends on a character boundary`);
      assert.equal(chars[0], icon, `${id} starts with its icon`);
      assert.ok(
        chars.slice(1, taken).every((char) => char === ' '),
        'only spaces follow the glyph',
      );
      assert.notEqual(chars[taken], ' ', 'the text starts right after the token');
    }
  }
});

function assertAdjacent(layout: ReturnType<typeof layoutFooter>, id: string, width: number): void {
  const icon = layout.hitRegions.find((region) => region.target === iconTarget(id));
  const text = layout.hitRegions.find((region) => region.target === id);
  if (!icon) return;
  assert.ok(text, `${id} keeps a text target next to its icon at ${width}`);
  assert.equal(text.y, icon.y);
  assert.equal(text.x, icon.x + icon.width, `${id} text starts where its icon ends at ${width}`);
  assert.ok(icon.x + icon.width + text.width <= width);
}

await test('the icon and the text are adjacent click targets on the same row, at every width', () => {
  for (const glyphs of [portableGlyphs, nerdGlyphs]) {
    for (let width = 20; width <= 260; width += 1) {
      const options = { paint: (text: string) => text, glyphs, now: NOW, config };
      const layout = layoutFooter(demoSnapshot, width, options);
      for (const id of ICON_ACTION_IDS) assertAdjacent(layout, id, width);
    }
  }
});

await test('items without an icon action keep a single target', () => {
  const layout = layoutFooter(demoSnapshot, 200, {
    paint: (text) => text,
    glyphs: portableGlyphs,
    now: NOW,
    config,
  });
  const targets = layout.hitRegions.map((region) => region.target);
  for (const id of ['cache', 'input', 'output', 'quota']) {
    assert.ok(!targets.includes(iconTarget(id)), `${id} has no separate icon target`);
  }
  assert.equal(targets.filter((target) => target === 'workspace').length, 1);
  assert.equal(targets.filter((target) => target === iconTarget('workspace')).length, 1);
});

await test('an item that is not drawn with its icon (Git unavailable) has no icon token', () => {
  const unavailable = {
    ...demoSnapshot,
    git: { branch: null, changed: null, ahead: null, monitoring: 'unavailable' as const },
  };
  const layout = layoutFooter(unavailable, 200, {
    paint: (text) => text,
    glyphs: portableGlyphs,
    now: NOW,
    config,
  });
  const targets = layout.hitRegions.map((region) => region.target);
  assert.ok(!targets.includes('branch:icon'));
});
