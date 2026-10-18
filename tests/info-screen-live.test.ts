import assert from 'node:assert/strict';
import { stripVTControlCharacters } from 'node:util';
import { mock, test } from 'node:test';
import { visibleWidth } from '@earendil-works/pi-tui';
import type { ExtensionContext, Theme } from '@earendil-works/pi-coding-agent';
import { openInfoScreen } from '../src/ui/info-screen.js';
import type { InfoScreen } from '../src/ui/info-screen.js';

interface View {
  render(width: number): string[];
  handleInput(data: string): void;
}
const theme = {
  fg: (_c: string, text: string) => text,
  bold: (text: string) => text,
} as unknown as Theme;

function fits(lines: string[], width: number, what: string): void {
  assert.ok(lines.length <= 12 + 6, `${what}: ${lines.length} rows drawn`);
  for (const line of lines) assert.ok(visibleWidth(line) <= width, `${what}: width ${width}`);
}

function open(screen: InfoScreen, rows: number) {
  const state = { view: undefined as View | undefined, renders: 0 };
  const ctx = {
    ui: {
      custom: (factory: (...args: unknown[]) => View) =>
        new Promise<void>((resolve) => {
          state.view = factory(
            { terminal: { rows }, requestRender: () => (state.renders += 1) },
            theme,
            undefined,
            resolve,
          );
        }),
    },
  } as unknown as ExtensionContext;
  const closed = openInfoScreen(ctx, screen);
  assert.ok(state.view);
  return { view: state.view, state, closed };
}

await test('the screen never grows past its window, whatever the content length or terminal height', async () => {
  for (const total of [0, 1, 5, 12, 13, 40, 500])
    for (const rows of [10, 16, 24, 40, 60]) {
      const body = Array.from(
        { length: total },
        (_, index) => `line ${index} ${'x'.repeat(index % 90)}`,
      );
      const { view, closed } = open({ title: 'T', lines: () => body }, rows);
      for (const width of [20, 60, 120])
        fits(view.render(width), width, `${total} lines, ${rows} rows`);
      view.handleInput('\u001b');
      await closed;
    }
});

await test('a body longer than the window shows a scroll bar whose thumb moves with the offset', async () => {
  const body = Array.from({ length: 60 }, (_, index) => `line ${index}`);
  const { view, closed } = open({ title: 'T', lines: () => body }, 40);
  const bars = (): string =>
    view
      .render(40)
      .filter((line) => /[┃│]$/u.test(line))
      .map((line) => line.at(-1))
      .join('');
  const top = bars();
  assert.match(top, /^┃+│+$/u, 'thumb at the top');
  view.handleInput('\u001b[F'); // End
  assert.match(bars(), /^│+┃+$/u, 'thumb at the bottom');
  view.handleInput('\u001b');
  await closed;
  const short = open({ title: 'T', lines: () => ['a', 'b'] }, 40);
  assert.equal(
    short.view.render(40).some((line) => /[┃│]$/u.test(line)),
    false,
    'no bar when nothing scrolls',
  );
  short.view.handleInput('\u001b');
  await short.closed;
});

await test('a live screen repaints each second, picks up new content, and stops when closed', async () => {
  mock.timers.enable({ apis: ['setInterval'] });
  try {
    let value = 1;
    const { view, state, closed } = open(
      { title: 'T', live: true, lines: () => [`value ${value}`] },
      30,
    );
    assert.match(stripVTControlCharacters(view.render(40).join('\n')), /value 1/u);
    mock.timers.tick(1000);
    assert.equal(state.renders, 1);
    value = 2;
    assert.match(view.render(40).join('\n'), /value 2/u);
    mock.timers.tick(1000);
    assert.equal(state.renders, 2);
    view.handleInput('\u001b');
    await closed;
    mock.timers.tick(5000);
    assert.equal(state.renders, 2, 'no repaint after close');
  } finally {
    mock.timers.reset();
  }
});

await test('a live screen that is no longer drawn stops its own timer', () => {
  mock.timers.enable({ apis: ['setInterval'] });
  try {
    const { view, state } = open({ title: 'T', live: true, lines: () => ['x'] }, 30);
    view.render(40);
    mock.timers.tick(1000);
    assert.equal(state.renders, 1);
    mock.timers.tick(1000); // nothing drew it since: the host dropped it
    mock.timers.tick(5000);
    assert.equal(state.renders, 1);
  } finally {
    mock.timers.reset();
  }
});

await test('a screen that is not live starts no timer', () => {
  mock.timers.enable({ apis: ['setInterval'] });
  try {
    const { view, state } = open({ title: 'T', lines: () => ['x'] }, 30);
    view.render(40);
    mock.timers.tick(10_000);
    assert.equal(state.renders, 0);
  } finally {
    mock.timers.reset();
  }
});

await test('a screen can own keys; they act, show in the hint, and the other keys still scroll and close', async () => {
  let period = 'month';
  const { view, closed } = open(
    {
      title: 'T',
      lines: () => [
        `period ${period}`,
        ...Array.from({ length: 40 }, (_, index) => `line ${index}`),
      ],
      keys: { d: () => (period = 'day'), w: () => (period = 'week') },
      hint: 'd/w period',
    },
    30,
  );
  assert.match(view.render(80).join('\n'), /period month/u);
  assert.match(view.render(80).join('\n'), /↑\/↓ scroll · d\/w period · Esc to close/u);
  view.handleInput('d');
  assert.match(view.render(80).join('\n'), /period day/u);
  view.handleInput('w');
  assert.match(view.render(80).join('\n'), /period week/u);
  view.handleInput('\u001b[F');
  assert.doesNotMatch(view.render(80).join('\n'), /period week/u, 'End still scrolls');
  view.handleInput('\u001b');
  await closed;
});

await test('a screen with refresh work runs it while open, repaints when it says something changed, and stops when closed', async () => {
  let runs = 0;
  let body = 'before';
  const { view, state, closed } = open(
    {
      title: 'T',
      lines: () => [body],
      refresh: {
        everyMs: 20,
        work: () => {
          runs += 1;
          body = `after ${runs}`;
          return Promise.resolve(runs < 3);
        },
      },
    },
    30,
  );
  view.render(40);
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.ok(runs >= 3, `${runs} runs`);
  assert.equal(
    state.renders,
    2,
    'repainted for the two runs that changed something, not for the others',
  );
  assert.match(view.render(40).join('\n'), /after \d/u);
  view.handleInput('\u001b');
  await closed;
  const after = runs;
  await new Promise((resolve) => setTimeout(resolve, 120));
  assert.equal(runs, after, 'nothing runs after the screen is closed');
});
