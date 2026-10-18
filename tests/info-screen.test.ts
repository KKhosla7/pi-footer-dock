import assert from 'node:assert/strict';
import { stripVTControlCharacters } from 'node:util';
import { test } from 'node:test';
import type { ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';
import { openInfoScreen } from '../src/ui/info-screen.js';

interface Interactive {
  render(width: number): string[];
  handleInput(data: string): void;
  handleMouse(event: unknown): unknown;
}
const colours: string[] = [];
const theme = {
  fg: (colour: string, text: string) => {
    colours.push(colour);
    return text;
  },
  bold: (text: string) => text,
} as unknown as Theme;

function open(lines: string[], rows = 20, pinned: { header?: string[]; footer?: string[] } = {}) {
  const state: { view?: Interactive; closed: boolean } = { closed: false };
  const ctx = {
    ui: {
      custom: (factory: (...args: unknown[]) => Interactive) =>
        new Promise<void>((resolve) => {
          state.view = factory({ terminal: { rows } }, theme, undefined, () => {
            state.closed = true;
            resolve();
          });
        }),
    },
  } as unknown as ExtensionContext;
  const closed = openInfoScreen(ctx, {
    title: 'Things',
    lines: () => lines,
    ...(pinned.header ? { header: () => pinned.header ?? [] } : {}),
    ...(pinned.footer ? { footer: () => pinned.footer ?? [] } : {}),
  });
  assert.ok(state.view);
  const view = state.view;
  // The scroll bar is the last column of a body row; these tests are about the words.
  const text = (width = 60) =>
    view.render(width).map((line) => stripVTControlCharacters(line).replace(/\s*[┃│]$/u, ''));
  return { view, state, closed, text };
}
const numbered = (count: number) =>
  Array.from({ length: count }, (_, index) => `line ${index + 1}`);

await test('the screen is framed like Pi menus: border rules, an accent title, a hint', () => {
  colours.length = 0;
  const { text, view, closed } = open(['alpha', 'beta']);
  const lines = text();
  assert.match(lines[0] ?? '', /^─+$/u);
  assert.equal(lines[1], ' Footer Dock › Things');
  assert.ok(lines.includes('alpha') && lines.includes('beta'));
  assert.match(lines.at(-2) ?? '', /Esc to close/u);
  assert.match(lines.at(-1) ?? '', /^─+$/u);
  assert.equal(lines.filter((line) => /^─+$/u.test(line)).length, 2, 'a rule above and below');
  assert.ok(['border', 'accent', 'dim'].every((colour) => colours.includes(colour)));
  view.handleInput('\u001b');
  return closed;
});

await test('long content scrolls with the arrow keys, pages, Home and End, and shows where you are', async () => {
  const { text, view, closed } = open(numbered(40), 30);
  assert.ok(text().includes('line 1') && !text().includes('line 30'));
  assert.match(text().at(-2) ?? '', /\(1-12\/40\)/u);
  view.handleInput('\u001b[B');
  assert.ok(!text().includes('line 1') && text().includes('line 2'));
  view.handleInput('\u001b[6~');
  assert.match(text().at(-2) ?? '', /\(14-25\/40\)/u, 'a page down moves a page');
  view.handleInput('\u001b[F');
  assert.ok(text().includes('line 40'), 'End shows the last line');
  view.handleInput('\u001b[B');
  assert.ok(text().includes('line 40'), 'cannot scroll past the end');
  view.handleInput('\u001b[H');
  assert.ok(text().includes('line 1'), 'Home returns to the top');
  view.handleInput('k');
  assert.ok(text().includes('line 1'), 'cannot scroll above the top');
  view.handleInput('q');
  await closed;
});

await test("the screen is a fixed window like Pi's own lists, whatever the content or terminal", async () => {
  for (const rows of [16, 20, 24, 30, 40, 60, 100]) {
    const { text, view, closed } = open(numbered(500), rows);
    const heights = new Set<number>();
    for (let step = 0; step < 60; step += 1) {
      const lines = text();
      heights.add(lines.length);
      assert.match(
        lines.at(-2) ?? '',
        /Esc to close/u,
        `the hint is always visible at ${rows} rows`,
      );
      assert.match(lines.at(-1) ?? '', /^─+$/u, 'and so is the closing rule');
      view.handleInput('\u001b[B');
    }
    assert.equal(heights.size, 1, `one height at ${rows} rows`);
    const [height] = [...heights];
    assert.ok((height ?? 0) <= 18, 'never more than a fixed window, even on a tall terminal');
    assert.ok((height ?? 0) <= Math.max(rows - 6, 10), `leaves room under it at ${rows} rows`);
    view.handleInput('\u001b');
    await closed;
  }
});

await test('the mouse wheel scrolls and nothing else is claimed', async () => {
  const { text, view, closed } = open(numbered(40), 20);
  const wheel = { type: 'wheel', button: 'none', x: 0, y: 0, width: 60, wheelDelta: 1 };
  assert.deepEqual(view.handleMouse(wheel), { handled: true });
  assert.ok(!text().includes('line 1') && text().includes('line 4'));
  assert.equal(view.handleMouse({ ...wheel, type: 'click' }), undefined);
  view.handleInput('\u0003');
  await closed;
});

await test('a line wider than the screen is cut, and a short terminal still shows a few rows', async () => {
  const { text, view, closed } = open(['x'.repeat(200), ...numbered(30)], 6);
  assert.ok(text(40).every((line) => line.length <= 40));
  assert.ok(text().filter((line) => line.startsWith('line') || line.startsWith('x')).length >= 4);
  view.handleInput('\u001b');
  await closed;
});

await test('pinned lines stay in view while the body scrolls, and the window shrinks to make room', async () => {
  const { text, view, closed } = open(numbered(100), 24, {
    header: ['SUMMARY', ''],
    footer: ['', 'LEGEND'],
  });
  const heights = new Set<number>();
  for (let step = 0; step < 100; step += 1) {
    const lines = text();
    heights.add(lines.length);
    assert.ok(lines.includes('SUMMARY') && lines.includes('LEGEND'), `both pinned at step ${step}`);
    assert.ok(lines.indexOf('SUMMARY') < lines.indexOf('LEGEND'));
    view.handleInput('\u001b[B');
  }
  assert.equal(heights.size, 1, 'one height while scrolling');
  view.handleInput('\u001b[F');
  assert.ok(
    text().includes('line 100') && text().includes('LEGEND'),
    'the legend is there at the end too',
  );
  const body = text().filter((line) => line.startsWith('line')).length;
  assert.equal(
    body,
    8,
    'on a short terminal the four pinned lines take their rows from the window',
  );
  view.handleInput('q');
  await closed;
});
