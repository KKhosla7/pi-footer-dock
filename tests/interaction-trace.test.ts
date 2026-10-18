import assert from 'node:assert/strict';
import { test } from 'node:test';
import { InteractionTrace } from '../src/core/interaction-trace.js';

await test('interaction diagnostics are opt-in, bounded, clearable and stop publishing when disabled', () => {
  const published: Record<string, unknown>[] = [];
  const trace = new InteractionTrace((record) => published.push(record));
  trace.record({ layer: 'footer', event: 'press', x: 0, y: 1 });
  assert.deepEqual(published, []);
  assert.deepEqual(trace.snapshot(), []);
  trace.enabled = true;
  for (let index = 0; index < 150; index += 1)
    trace.record({ layer: 'footer', event: 'press', index });
  assert.equal(published.length, 150);
  assert.equal(trace.snapshot().length, 128);
  assert.equal(trace.snapshot()[0]?.index, 22);
  trace.enabled = false;
  trace.record({ layer: 'footer', event: 'click' });
  assert.equal(published.length, 150);
  trace.clear();
  assert.deepEqual(trace.snapshot(), []);
});
