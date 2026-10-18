import assert from 'node:assert/strict';
import { stripVTControlCharacters } from 'node:util';
import { test } from 'node:test';
import { SettingsList } from '@earendil-works/pi-tui';
import type { SettingItem } from '@earendil-works/pi-tui';
import { StableList, tallest, withEscape } from '../src/ui/stable-list.js';

const theme = {
  label: (text: string) => text,
  value: (text: string) => text,
  description: (text: string) => text,
  cursor: '> ',
  hint: (text: string) => text,
};
const DOWN = '\u001b[B';
const VISIBLE = 5;
const options = { theme, visible: VISIBLE };
const plain = (lines: string[]) => lines.map((line) => stripVTControlCharacters(line));

/** Rows whose descriptions differ wildly: none, short, and long enough to wrap. */
function uneven(count: number): SettingItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `row-${index}`,
    label: `Row ${index}`,
    currentValue: 'on',
    values: ['on', 'off'],
    ...(index % 3 === 1 ? { description: 'A short note.' } : {}),
    ...(index % 3 === 2 ? { description: 'A much longer note. '.repeat(6) } : {}),
  }));
}
function stable(items: SettingItem[], floor: (width: number) => number): StableList {
  return new StableList(
    new SettingsList(
      items,
      VISIBLE,
      theme,
      () => undefined,
      () => undefined,
    ),
    floor,
  );
}

await test('without help the list jumps as the selection moves (the bug this guards against)', () => {
  const list = new SettingsList(
    uneven(4),
    VISIBLE,
    theme,
    () => undefined,
    () => undefined,
  );
  const heights = new Set<number>();
  for (let step = 0; step < 4; step += 1) {
    heights.add(list.render(60).length);
    list.handleInput(DOWN);
  }
  assert.ok(heights.size > 1);
});

await test('whatever the rows, descriptions, width or list length, arrow keys never change the height', () => {
  for (const count of [1, 3, 5, 6, 12, 30]) {
    for (const width of [24, 40, 80, 140]) {
      const items = uneven(count);
      const list = stable(items, (columns) => tallest([items], columns, options));
      const heights = new Set<number>();
      const hints = new Set<number>();
      for (let step = 0; step < count * 2 + 2; step += 1) {
        const lines = plain(list.render(width));
        heights.add(lines.length);
        hints.add(lines.length - 1 - lines.findIndex((line) => line.includes('Enter/Space')));
        list.handleInput(DOWN);
      }
      assert.equal(heights.size, 1, `${count} rows at ${width} columns`);
      assert.equal(hints.size, 1, `the hint stays put with ${count} rows at ${width} columns`);
    }
  }
});

await test('lists sharing a floor are all the same height, so entering a group moves nothing', () => {
  const small = uneven(2);
  const large = uneven(9);
  const floor = (width: number) => tallest([small, large], width, options);
  const heightOf = (items: SettingItem[]) => stable(items, floor).render(70).length;
  assert.equal(heightOf(small), heightOf(large));
});

await test('the hint is reworded for where the list sits, and nothing else is touched', () => {
  const back = withEscape(theme, 'go back');
  assert.equal(
    back.hint('  Enter/Space to change · Esc to cancel'),
    '  Enter/Space to change · Esc to go back',
  );
  assert.equal(back.hint('unrelated'), 'unrelated');
  const list = new SettingsList(
    uneven(2),
    VISIBLE,
    back,
    () => undefined,
    () => undefined,
  );
  assert.match(plain(list.render(80)).join('\n'), /Esc to go back/u);
});

await test('a header shifts clicks so rows are counted from the first line under it', () => {
  const seen: number[] = [];
  const list = new SettingsList(
    uneven(3),
    VISIBLE,
    theme,
    () => undefined,
    () => undefined,
  );
  const original = list.handleMouse.bind(list);
  list.handleMouse = (event) => {
    seen.push(event.y);
    return original(event);
  };
  const framed = new StableList(
    list,
    () => 0,
    () => ['rule', 'title'],
    () => ['rule'],
  );
  const lines = plain(framed.render(40));
  assert.deepEqual([lines[0], lines[1], lines.at(-1)], ['rule', 'title', 'rule']);
  framed.handleMouse({
    type: 'click',
    button: 'left',
    x: 2,
    y: 3,
    screenX: 2,
    screenY: 3,
    width: 40,
    height: 12,
    shift: false,
    alt: false,
    ctrl: false,
  });
  assert.deepEqual(seen, [1], 'y 3 on screen is row 1 of the list');
});
