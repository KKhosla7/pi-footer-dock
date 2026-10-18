import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LIMITS } from '../src/core/ext/protocol.js';
import { ExtensionRegistry } from '../src/core/ext/registry.js';
import { parseRegistration } from '../src/core/ext/validate.js';
import { registration } from './support/fake-registration.js';

await test('a valid registration is kept as declared, with its defaults filled in', () => {
  const { registration: parsed, problems } = parseRegistration(registration());
  assert.deepEqual(problems, []);
  assert.ok(parsed);
  assert.equal(parsed.items.length, 2);
  const status = parsed.items[0];
  assert.ok(status);
  assert.deepEqual([status.icon, status.text], ['event', 'explain']);
  assert.equal(status.at.xs, 'hide');
  assert.equal(parsed.settings?.rows[0]?.current, 'brief');
});

await test('hostile registrations never throw, never exceed the bounds, and say what was dropped', () => {
  const hostile = [
    null,
    5,
    'x',
    [],
    { v: 2 },
    { v: 1 },
    { v: 1, ext: 'Bad Name', label: 'x' },
    { v: 1, ext: 'ok', label: '' },
    { v: 1, ext: 'ok', label: 'Ok', items: 'nope' },
    {
      v: 1,
      ext: 'ok',
      label: 'Ok',
      items: [{ id: 'icon', region: 'row1.left', at: { xl: { text: 'x' } } }],
    },
    {
      v: 1,
      ext: 'ok',
      label: 'Ok',
      items: [{ id: 'a', region: 'row9.left', at: { xl: { text: 'x' } } }],
    },
    {
      v: 1,
      ext: 'ok',
      label: 'Ok',
      items: [
        { id: 'a', region: 'row1.left', at: { xl: { text: 'x', icon: 'rocket', tone: 'purple' } } },
      ],
    },
    JSON.parse(
      '{"v":1,"ext":"ok","label":"Ok","__proto__":{"polluted":true},"items":[{"id":"a","constructor":{"x":1},"region":"row1.left","at":{"xl":{"text":"x"}}}]}',
    ),
  ];
  for (const value of hostile) assert.doesNotThrow(() => parseRegistration(value));
  assert.ok(
    parseRegistration({
      v: 1,
      ext: 'ok',
      label: 'Ok',
      items: [{ id: 'icon', region: 'row1.left', at: { xl: { text: 'x' } } }],
    }).problems.length > 0,
  );
  const polluted = parseRegistration(hostile.at(-1));
  assert.equal(({} as Record<string, unknown>).polluted, undefined, 'no prototype pollution');
  assert.equal(
    polluted.registration?.items[0]?.at.xl &&
      typeof polluted.registration.items[0].at.xl === 'object'
      ? polluted.registration.items[0].at.xl.icon
      : undefined,
    undefined,
  );
});

await test('text is cleaned of escape sequences and controls, and every size is cut to its bound', () => {
  const big = 'x'.repeat(10_000_000);
  const { registration: parsed } = parseRegistration({
    v: 1,
    ext: 'ok',
    label: `Ok\u001b[31m${big}`,
    items: Array.from({ length: 1000 }, (_, index) => ({
      id: `item-${index}`,
      region: 'row1.left',
      at: { xl: { text: `\u001b]0;title\u0007evil\r\n${big}` } },
      explain: {
        title: 'T',
        reports: Array.from({ length: 100 }, () => big),
        missingWhen: ['m'],
        blocks: Array.from({ length: 500 }, () => ({ kind: 'note', text: big })),
      },
    })),
    settings: {
      rows: Array.from({ length: 100 }, (_, index) => ({
        id: `r${index}`,
        label: 'L',
        values: ['a', 'b'],
        current: 'a',
      })),
    },
  });
  assert.ok(parsed);
  assert.ok(Array.from(parsed.label).length <= LIMITS.label);
  assert.equal(parsed.items.length, LIMITS.items);
  const first = parsed.items[0];
  assert.ok(first && typeof first.at.xl === 'object');
  assert.equal(
    Array.from(first.at.xl.text, (char) => char.charCodeAt(0)).some((code) => code < 32),
    false,
  );
  assert.doesNotMatch(first.at.xl.text, /title/u);
  assert.ok(Array.from(first.at.xl.text).length <= LIMITS.formText);
  assert.ok((first.explain?.blocks.length ?? 0) <= LIMITS.blocks);
  assert.ok((first.explain?.reports.length ?? 0) <= LIMITS.bullets);
  assert.equal(parsed.settings?.rows.length, LIMITS.settingRows);
});

await test('the registry replaces on register, updates in place, unregisters, and refuses a ninth extension', () => {
  const registry = new ExtensionRegistry();
  assert.deepEqual(registry.register(registration()), []);
  const first = registry.version;
  registry.register(registration());
  assert.equal(registry.size, 1, 'the same message twice is the same as once');
  assert.deepEqual(registry.ids('row2.right'), ['acme:status']);
  assert.deepEqual(registry.usedRegions(), ['row2.right', 'row3.left']);
  assert.deepEqual(
    registry.update({
      v: 1,
      ext: 'acme',
      items: [{ id: 'status', at: { xl: { text: 'Acme: idle' } } }],
      settings: [{ row: 'mode', current: 'full' }],
    }),
    [],
  );
  const found = registry.find('acme:status');
  assert.ok(
    found && typeof found.item.at.xl === 'object' && found.item.at.xl.text === 'Acme: idle',
  );
  assert.equal(found.registration.settings?.rows[0]?.current, 'full');
  assert.ok(
    registry.update({ v: 1, ext: 'acme', settings: [{ row: 'mode', current: 'weird' }] }).length >
      0,
    'a value that is not offered is refused',
  );
  assert.ok(registry.update({ v: 1, ext: 'nobody' }).length > 0);
  assert.ok(registry.version > first);
  registry.unregister('acme');
  assert.equal(registry.size, 0);
  for (let index = 0; index < 8; index += 1)
    registry.register(registration({ ext: `ext-${index}` }));
  assert.ok(registry.register(registration({ ext: 'ninth' })).length > 0);
  assert.equal(registry.size, 8);
  registry.clear();
  assert.equal(registry.size, 0);
});
