import assert from 'node:assert/strict';
import { test } from 'node:test';
import { stripVTControlCharacters } from 'node:util';
import { ResponseSpeed } from '../src/core/response-speed.js';
import { layoutFooter } from '../src/ui/layout.js';
import { portableGlyphs } from '../src/ui/glyphs.js';
import { demoSnapshot } from './reference.js';

await test('speed uses SDK duration, not late message timing or time spent idle', () => {
  let now = 100;
  const speed = new ResponseSpeed(() => now);
  speed.start();
  now = 5100;
  speed.update('text_delta', 'fixture');
  now = 6100;
  speed.end({ output: 120, stopReason: 'stop', durationMs: 6000, reasoning: 30 });
  assert.equal(speed.value, 20);
  assert.equal(speed.sample?.firstContentMs, 5000);
  assert.equal(speed.sample.reasoning, 30);
  now += 100_000;
  assert.equal(speed.value, 20);
  speed.start();
  assert.equal(speed.value, null);
  speed.end({ output: 20, stopReason: 'toolUse', durationMs: 1000 });
  assert.equal(speed.value, 20);
  speed.reset();
  assert.equal(speed.value, null);
  assert.equal(speed.end({ output: 20, stopReason: 'stop', durationMs: 1000 }), false);
});

await test('invalid usage, untimed/deferred/errors and low-precision intervals do not invent speed', () => {
  const speed = new ResponseSpeed();
  for (const output of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    speed.start();
    speed.end({ output, stopReason: 'stop', durationMs: 1000 });
    assert.equal(speed.value, null);
  }
  for (const durationMs of [undefined, 0, -1, NaN, Infinity, 1, 19.9, Number.MIN_VALUE]) {
    speed.start();
    speed.end({ output: 100, stopReason: 'stop', durationMs });
    assert.equal(speed.value, null);
  }
  for (const stopReason of ['error', 'aborted', 'pending', 'deferred', 'unrecognized']) {
    speed.start();
    assert.equal(speed.end({ output: 100, stopReason, durationMs: 1000 }), false);
    assert.equal(speed.value, null);
  }
  speed.start();
  assert.equal(
    speed.end({ output: 200, durationMs: 1000, stopReason: 'stop', deferred: { id: 'fixture' } }),
    false,
  );
  assert.equal(speed.value, null);
  speed.start();
  speed.end({ output: 100, stopReason: 'length', durationMs: 20, reasoning: 101 });
  assert.equal(speed.value, 5000);
  assert.equal(speed.sample?.reasoning, null);
});

await test('first meaningful content and first text are sampled once without retaining deltas', () => {
  let now = 0;
  const speed = new ResponseSpeed(() => now);
  speed.start();
  speed.update('text_start', 'ignored');
  speed.update('text_delta', '');
  now = 300;
  speed.update('thinking_delta', 'not retained');
  now = 800;
  speed.update('text_delta', 'not retained either');
  now = 1200;
  speed.update('text_delta', 'later');
  speed.end({ output: 10, stopReason: 'stop', durationMs: 1000 });
  assert.equal(speed.sample?.firstContentMs, 300);
  assert.equal(speed.sample.firstTextMs, 800);
  assert.ok(!JSON.stringify(speed.sample).includes('retained'));
  speed.reset();
  speed.update('text_delta', 'stale');
  assert.equal(speed.sample, null);
});

await test('invalid local clocks never invent negative content latency or accept an unpaired response', () => {
  let now = NaN;
  const speed = new ResponseSpeed(() => now);
  speed.start();
  assert.equal(speed.end({ output: 10, stopReason: 'stop', durationMs: 1000 }), false);
  now = 100;
  speed.start();
  now = 90;
  speed.update('toolcall_delta', 'fixture');
  now = 100;
  speed.update('toolcall_delta', 'fixture');
  speed.end({ output: 10, stopReason: 'stop', durationMs: 1000 });
  assert.equal(speed.sample?.firstContentMs, 0);
  assert.equal(speed.sample.firstTextMs, null);
});

await test('footer shows measured throughput only when available, without changing its appearance', () => {
  const options = { glyphs: portableGlyphs, paint: (text: string) => text, now: 4_000_000_000_000 };
  const render = (speed: number | null) =>
    layoutFooter({ ...demoSnapshot, outputTokensPerSecond: speed }, 220, options)
      .lines.map(stripVTControlCharacters)
      .join('\n');
  assert.match(render(42.35), /⚡ 42.4 tok\/s/u);
  assert.match(render(0.001), /⚡ <0\.1 tok\/s/u);
  assert.doesNotMatch(render(42.35), /\bavg\b/u);
  assert.doesNotMatch(render(null), /tok\/s/u);
});

await test('after a successful response without a figure, the reason is kept, and cleared at the next turn', () => {
  const speed = new ResponseSpeed();
  const finish = (output: number, durationMs?: number) => {
    speed.start();
    speed.end({ output, stopReason: 'stop', durationMs });
    return speed.unmeasured;
  };
  assert.equal(finish(100), 'no-duration');
  assert.equal(finish(100, 5), 'too-short');
  assert.equal(finish(0, 1000), 'no-output');
  assert.equal(finish(100, 1000), null);
  speed.start();
  speed.end({ output: 100, stopReason: 'error', durationMs: undefined });
  assert.equal(speed.unmeasured, null, 'a failed response says nothing about the provider');
  finish(100);
  speed.start();
  assert.equal(speed.unmeasured, null);
});
