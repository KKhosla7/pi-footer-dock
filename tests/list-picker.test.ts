import assert from 'node:assert/strict';
import { stripVTControlCharacters } from 'node:util';
import { test } from 'node:test';
import { visibleWidth } from '@earendil-works/pi-tui';
import type { ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';
import { closeInfoScreen } from '../src/ui/info-screen.js';
import { openPicker } from '../src/ui/list-picker.js';
import type { PickerChoice, PickerSpec } from '../src/ui/list-picker.js';

interface View {
  render(width: number): string[];
  handleInput(data: string): void;
  handleMouse(event: unknown): unknown;
}
const theme = {
  fg: (_c: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

function open(spec: PickerSpec, rows = 30) {
  const state = { view: undefined as View | undefined };
  const ctx = {
    ui: {
      custom: (factory: (...args: unknown[]) => View) =>
        new Promise((resolve) => {
          state.view = factory({ terminal: { rows } }, theme, undefined, resolve);
        }),
    },
  } as unknown as ExtensionContext;
  const chosen = openPicker(ctx, spec);
  assert.ok(state.view);
  const view = state.view;
  const text = (width = 70) => view.render(width).map((line) => stripVTControlCharacters(line));
  return { view, chosen, text };
}
const choice = (id: string, extra: Partial<PickerChoice> = {}): PickerChoice => ({
  id,
  search: id,
  row: () => id,
  ...extra,
});
const many = (count: number) =>
  Array.from({ length: count }, (_, index) => choice(`item-${index}`));

await test('Enter chooses the item under the cursor, Esc chooses nothing', async () => {
  const first = open({
    title: 'Things',
    choices: [choice('a'), choice('b'), choice('c')],
    start: 'b',
  });
  assert.match(first.text().join('\n'), /→ b/u);
  first.view.handleInput('\u001b[B');
  first.view.handleInput('\r');
  assert.equal(await first.chosen, 'c');
  const second = open({ title: 'Things', choices: [choice('a')] });
  second.view.handleInput('\u001b');
  assert.equal(await second.chosen, undefined);
});

await test('a searchable picker takes typing, narrows, and Enter picks the best match; Backspace widens', async () => {
  const { view, chosen, text } = open({
    title: 'Models',
    searchable: true,
    choices: [choice('claude-opus'), choice('gpt-6'), choice('kimi-k3')],
  });
  assert.match(text()[3] ?? '', /Search/u);
  for (const letter of 'kimi') view.handleInput(letter);
  assert.ok(text().join('\n').includes('(1/1)'));
  assert.doesNotMatch(text().join('\n'), /gpt-6/u);
  view.handleInput('\u007f');
  view.handleInput('\u007f');
  view.handleInput('\u007f');
  view.handleInput('\u007f');
  assert.match(
    text().join('\n'),
    /→ kimi-k3[\s\S]*\(3\/3\)/u,
    'cleared: the full list, still on the same row',
  );
  for (const letter of 'zzz') view.handleInput(letter);
  assert.match(text().join('\n'), /No matches/u);
  view.handleInput('\r');
  assert.equal(await chosen, undefined, 'Enter on an empty list chooses nothing');
});

await test('without a search box q closes and j/k move; escape sequences are never typed into a query', async () => {
  const plain = open({ title: 'List', choices: [choice('a'), choice('b')] });
  plain.view.handleInput('j');
  plain.view.handleInput('\r');
  assert.equal(await plain.chosen, 'b');
  const searching = open({ title: 'List', searchable: true, choices: [choice('a'), choice('b')] });
  searching.view.handleInput('\u001b[Z');
  searching.view.handleInput('\u0001');
  assert.doesNotMatch(searching.text()[3] ?? '', /\[Z/u);
  searching.view.handleInput('\u001b');
  await searching.chosen;
});

function fitsEverywhere(view: View, label: string): void {
  for (const width of [20, 60, 120]) {
    const lines = view.render(width);
    assert.ok(lines.length <= 12 + 12, `${label}: ${lines.length} rows`);
    for (const line of lines) assert.ok(visibleWidth(line) <= width, `${label}: width ${width}`);
  }
}

await test('the window follows the cursor, shows a position, and never exceeds its height or width', async () => {
  for (const total of [0, 1, 5, 40, 500])
    for (const rows of [10, 24, 50]) {
      const spec = {
        title: 'Many',
        searchable: true,
        choices: many(total),
        header: () => ['HEAD'],
        footer: () => ['FOOT'],
      };
      const { view, chosen } = open(spec, rows);
      for (let step = 0; step < Math.min(60, total + 2); step += 1) {
        fitsEverywhere(view, `${total} choices, ${rows} rows`);
        view.handleInput('\u001b[B');
      }
      if (total > 0)
        assert.match(view.render(60).join('\n'), /→ item-/u, 'the cursor row is always on screen');
      view.handleInput('\u001b');
      await chosen;
    }
});

await test('sections give headings, the detail line follows the cursor, and the wheel moves it', async () => {
  const { view, chosen, text } = open({
    title: 'Branches',
    choices: [
      choice('main', { section: 'Local', detail: 'detail of main' }),
      choice('dev', { section: 'Local', detail: 'detail of dev' }),
      choice('origin/x', { section: 'Remote', detail: 'detail of x' }),
    ],
  });
  assert.match(text().join('\n'), /Local[\s\S]*main[\s\S]*dev[\s\S]*Remote[\s\S]*origin\/x/u);
  assert.match(text().join('\n'), /detail of main/u);
  assert.deepEqual(view.handleMouse({ type: 'wheel', wheelDelta: 1 }), { handled: true });
  assert.match(text().join('\n'), /detail of x/u, 'the wheel moved the cursor to the last row');
  assert.equal(view.handleMouse({ type: 'click' }), undefined);
  view.handleInput('\r');
  assert.equal(await chosen, 'origin/x');
});

await test('the same icon click closes it, like any other screen', async () => {
  const { chosen } = open({ title: 'Models', choices: [choice('a')] });
  closeInfoScreen();
  assert.equal(await chosen, undefined);
});

await test('sections are separated by a blank row and headed in bold with their note', () => {
  const { view, text } = open({
    title: 'Branches',
    choices: [
      choice('main', { section: 'Local branches (1)' }),
      choice('origin/main', {
        section: 'Remote branches (1)',
        sectionNote: 'as of the last fetch',
      }),
    ],
  });
  const lines = text();
  const remote = lines.findIndex((line) => line.includes('Remote branches (1)'));
  assert.ok(remote > 0);
  assert.equal(lines[remote - 1], '', 'a blank row above the second heading');
  assert.match(lines[remote] ?? '', /Remote branches \(1\)\s+as of the last fetch/u);
  assert.notEqual(lines[remote - 2], '', 'one blank row, not two');
  view.handleInput('\u001b');
});
