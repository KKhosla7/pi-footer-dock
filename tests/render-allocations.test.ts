import assert from 'node:assert/strict';
import { test } from 'node:test';
import { renderSegment } from '../src/ui/segments.js';
import { portableGlyphs } from '../src/ui/glyphs.js';
import { defaultFooterConfig } from '../src/core/footer-config.js';
import { demoSnapshot } from './reference.js';

await test('stock and template dispatch allocate no per-render formatter Maps', () => {
  const config = defaultFooterConfig();
  const ids = config.rows.flatMap((row) => [...row.left, ...row.right]);
  const options = { paint: (text: string) => text, glyphs: portableGlyphs };
  const custom = { ...config, slots: { input: { text: '{icon} {input} {provider}' } } };
  const Original = globalThis.Map;
  let allocations = 0;
  globalThis.Map = new Proxy(Original, {
    construct(target, args) {
      allocations += 1;
      return Reflect.construct(target, args) as object;
    },
  });
  try {
    for (let i = 0; i < 100; i += 1) {
      for (const id of ids) renderSegment(id, demoSnapshot, options, { config, look: 'xl' });
      renderSegment('input', demoSnapshot, options, { config: custom, look: 'xl' });
    }
    assert.equal(
      allocations,
      0,
      'previous implementation allocated a dispatch Map for every slot/template',
    );
  } finally {
    globalThis.Map = Original;
  }
});
