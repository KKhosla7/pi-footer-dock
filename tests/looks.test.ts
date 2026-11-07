import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOOKS, isLook, lookIndex, stockForms, variantAt } from '../src/core/looks.js';

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
