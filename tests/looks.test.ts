import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LOOKS,
  isLook,
  lookIndex,
  removalOrder,
  richestFit,
  stockForms,
  variantAt,
} from '../src/core/looks.js';

await test('looks are ordered richest to most compact and validated', () => {
  assert.deepEqual([...LOOKS], ['xl', 'lg', 'md', 'sm', 'xs']);
  assert.equal(lookIndex('xl'), 0);
  assert.equal(lookIndex('xs'), 4);
  assert.ok(isLook('md'));
  assert.ok(!isLook('xxl') && !isLook('') && !isLook(3) && !isLook(undefined));
});

await test('a look not listed inherits the nearest richer one, like desktop-first CSS', () => {
  const table = { xl: 'full', md: 'short', xs: 'hide' } as const;
  assert.deepEqual(
    LOOKS.map((look) => variantAt(table, look)),
    ['full', 'full', 'short', 'short', 'hide'],
  );
  assert.equal(variantAt(undefined, 'xs'), 'full', 'an item without a table is always shown');
});

await test('hideAt hides at that look and every narrower one, never a richer one', () => {
  const table = { xl: 'full' } as const;
  assert.deepEqual(
    LOOKS.map((look) => variantAt(table, look, 'md')),
    ['full', 'full', 'hide', 'hide', 'hide'],
  );
});

await test('every stock item defines its richest look, so the cascade always resolves', () => {
  for (const [id, table] of stockForms) assert.equal(table.xl, 'full', `${id} defines xl`);
});

await test('the richest look that fits wins; nothing fitting is reported, not guessed', () => {
  const widths = { xl: 120, lg: 100, md: 80, sm: 60, xs: 40 };
  const render = (look: keyof typeof widths) => widths[look];
  assert.equal(richestFit(render, (width) => width <= 100)?.look, 'lg');
  assert.equal(richestFit(render, (width) => width <= 120)?.look, 'xl');
  assert.equal(richestFit(render, (width) => width <= 40)?.look, 'xs');
  assert.equal(
    richestFit(render, (width) => width <= 10),
    undefined,
  );
});

await test('for fixed content a narrower terminal never picks a richer look', () => {
  const widths = { xl: 120, lg: 100, md: 80, sm: 60, xs: 40 };
  let previous = -1;
  for (let columns = 260; columns >= 20; columns -= 1) {
    const chosen = richestFit(
      (look) => widths[look],
      (width) => width <= columns,
    );
    const index = chosen ? lookIndex(chosen.look) : LOOKS.length;
    assert.ok(index >= previous, `no richer look at ${columns}`);
    previous = index;
  }
});

await test('removal order: unknown items first from the end, essentials next, project last', () => {
  const ids = ['workspace', 'branch', 'model', 'thinking', 'custom-a', 'cache', 'custom-b'];
  assert.deepEqual(removalOrder(ids), [
    'custom-b',
    'cache',
    'custom-a',
    'thinking',
    'model',
    'branch',
    'workspace',
  ]);
  assert.deepEqual(removalOrder(['context', 'context-usage', 'compaction', 'quota', 'cost']), [
    'cost',
    'compaction',
    'context-usage',
    'context',
    'quota',
  ]);
  assert.deepEqual(removalOrder([]), []);
});
