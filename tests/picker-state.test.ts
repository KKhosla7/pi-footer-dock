import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PickerState } from '../src/core/picker/state.js';
import type { Choice } from '../src/core/picker/state.js';

const choices: Choice[] = [
  'claude-opus',
  'claude-sonnet',
  'gpt-6',
  'gpt-6-mini',
  'deepseek-v4',
  'kimi-k3',
].map((name) => ({
  id: name,
  search: `${name} provider-${name.slice(0, 3)}`,
}));

await test('the cursor starts on the requested choice, else on the first', () => {
  assert.equal(new PickerState(choices, 'gpt-6').current?.id, 'gpt-6');
  assert.equal(new PickerState(choices, 'missing').current?.id, 'claude-opus');
  assert.equal(new PickerState([]).current, undefined);
});

await test('arrows wrap at both ends, jumps stop at them, and an empty list never moves', () => {
  const state = new PickerState(choices);
  state.move(-1);
  assert.equal(state.selected, 5);
  state.move(1);
  assert.equal(state.selected, 0);
  state.jump(100);
  assert.equal(state.selected, 5);
  state.jump(-100);
  assert.equal(state.selected, 0);
  state.end();
  assert.equal(state.selected, 5);
  state.home();
  assert.equal(state.selected, 0);
  const empty = new PickerState([]);
  empty.move(1);
  empty.jump(3);
  assert.equal(empty.selected, 0);
});

await test('typing narrows the list fuzzily and puts the cursor on the best match', () => {
  const state = new PickerState(choices, 'kimi-k3');
  state.type('g');
  state.type('p');
  state.type('t');
  assert.deepEqual(
    state.items
      .map((choice) => choice.id)
      .slice(0, 2)
      .sort(),
    ['gpt-6', 'gpt-6-mini'],
  );
  assert.equal(state.selected, 0);
  state.type('zzz');
  assert.equal(state.items.length, 0);
  assert.equal(state.current, undefined);
});

await test('backspace widens again, and clearing the query returns to the row that was under the cursor', () => {
  const state = new PickerState(choices, 'gpt-6');
  state.type('mini');
  assert.equal(state.current?.id, 'gpt-6-mini');
  for (let index = 0; index < 4; index += 1) state.backspace();
  assert.equal(state.query, '');
  const row = state.current;
  assert.ok(row);
  assert.equal(row.id, 'gpt-6-mini', 'the same row, now in the full list');
  state.backspace();
  assert.equal(state.query, '');
});

function press(state: PickerState<Choice>, step: number): void {
  switch ((step * 7 + (step % 5)) % 9) {
    case 0:
      state.move(1);
      break;
    case 1:
      state.move(-1);
      break;
    case 2:
      state.jump(3);
      break;
    case 3:
      state.jump(-9);
      break;
    case 4:
      state.end();
      break;
    case 5:
      state.home();
      break;
    case 6:
      state.type('c');
      break;
    case 7:
      state.type('x');
      break;
    default:
      state.backspace();
  }
}

await test('whatever the keys, the cursor stays inside the filtered list', () => {
  const state = new PickerState(choices);
  for (let step = 0; step < 500; step += 1) {
    press(state, step);
    const size = state.items.length;
    assert.ok(
      size === 0 ? state.selected === 0 : state.selected >= 0 && state.selected < size,
      `step ${step}`,
    );
  }
});
