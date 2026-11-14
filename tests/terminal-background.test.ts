import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TerminalBackground } from '../src/ui/terminal-background.js';

interface Colors {
  background?: { r: number; g: number; b: number };
}
function fakeTui(answer: () => Promise<Colors>) {
  const calls: { timeoutMs: number; late: ((colors: Colors) => void) | undefined }[] = [];
  const listeners = new Set<(scheme: 'dark' | 'light') => void>();
  return {
    calls,
    listeners,
    tui: {
      queryTerminalColors: (options: {
        timeoutMs: number;
        onLateReply?: (colors: Colors) => void;
      }) => {
        calls.push({ timeoutMs: options.timeoutMs, late: options.onLateReply });
        return answer();
      },
      onTerminalColorSchemeChange: (listener: (scheme: 'dark' | 'light') => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    } as never,
  };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));

await test('the background is asked for once when the footer starts, and learnt when it answers', async () => {
  const { tui, calls } = fakeTui(() => Promise.resolve({ background: { r: 30, g: 30, b: 46 } }));
  const background = new TerminalBackground();
  let redraws = 0;
  assert.equal(background.value, undefined);
  background.watch(tui, () => {
    redraws += 1;
  });
  await settle();
  assert.deepEqual(background.value, { r: 30, g: 30, b: 46 });
  assert.equal(redraws, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.timeoutMs, 250);
  background.watch(tui, () => {
    redraws += 1;
  });
  await settle();
  assert.equal(calls.length, 1, 'a rebuilt footer does not ask again');
});

await test('a switch between light and dark asks again; stopping removes the listener', async () => {
  let answer: Colors = { background: { r: 0, g: 0, b: 0 } };
  const { tui, calls, listeners } = fakeTui(() => Promise.resolve(answer));
  const background = new TerminalBackground();
  let redraws = 0;
  const stop = background.watch(tui, () => {
    redraws += 1;
  });
  await settle();
  answer = { background: { r: 255, g: 255, b: 255 } };
  for (const listener of listeners) listener('light');
  await settle();
  assert.equal(calls.length, 2);
  assert.deepEqual(background.value, { r: 255, g: 255, b: 255 });
  assert.equal(redraws, 2);
  for (const listener of listeners) listener('light');
  await settle();
  assert.equal(redraws, 2, 'the same answer is not a change');
  stop();
  assert.equal(listeners.size, 0);
});

await test('a late reply is learnt too', async () => {
  const { tui, calls } = fakeTui(() => Promise.resolve({}));
  const background = new TerminalBackground();
  background.watch(tui, () => undefined);
  await settle();
  assert.equal(background.value, undefined, 'no background in time');
  calls[0]?.late?.({ background: { r: 1, g: 2, b: 3 } });
  assert.deepEqual(background.value, { r: 1, g: 2, b: 3 });
});

await test('no answer, a bad answer, a failure or an older Pi change nothing and throw nothing', async () => {
  const bad = [
    { background: { r: 300, g: 0, b: 0 } },
    { background: { r: -1, g: 0, b: 0 } },
    { background: { r: 1.5, g: 0, b: 0 } },
    { background: { r: '1', g: 0, b: 0 } },
    { background: { r: 1, g: 0 } },
    {},
  ];
  for (const answer of bad) {
    const { tui } = fakeTui(() => Promise.resolve(answer as never));
    const background = new TerminalBackground();
    background.watch(tui, () => {
      assert.fail('no redraw');
    });
    await settle();
    assert.equal(background.value, undefined);
  }
  const { tui } = fakeTui(() => Promise.reject(new Error('closed')));
  const background = new TerminalBackground();
  background.watch(tui, () => undefined);
  await settle();
  assert.equal(background.value, undefined);
  const stop = new TerminalBackground().watch({}, () => undefined);
  assert.doesNotThrow(() => {
    stop();
  });
});
