import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { ExtensionBus } from '../src/adapters/ext-bus.js';
import { CHANNELS } from '../src/core/ext/protocol.js';
import { registration } from './support/fake-registration.js';

/** A tiny event bus like Pi's: synchronous, with unsubscribe, recording what was emitted. */
function fakeEvents() {
  const handlers = new Map<string, Set<(data: unknown) => void>>();
  const seen: { channel: string; data: unknown }[] = [];
  const on = (channel: string, handler: (data: unknown) => void): (() => void) => {
    const set = handlers.get(channel) ?? new Set();
    handlers.set(channel, set);
    set.add(handler);
    return () => set.delete(handler);
  };
  const emit = (channel: string, data: unknown): void => {
    seen.push({ channel, data });
    for (const handler of [...(handlers.get(channel) ?? [])]) handler(data);
  };
  return { events: { on, emit }, seen, on, emit };
}
const heard = (world: ReturnType<typeof fakeEvents>, channel: string) =>
  world.seen.filter((entry) => entry.channel === channel);

await test('starting announces ready; hello is answered with ready; order of arrival does not matter', () => {
  const world = fakeEvents();
  const bus = new ExtensionBus(world, () => undefined);
  world.emit(CHANNELS.register, registration());
  assert.equal(bus.registry.size, 0, 'not listening yet');
  bus.start();
  assert.equal(heard(world, CHANNELS.ready).length, 1);
  world.emit(CHANNELS.hello, { v: 1 });
  assert.equal(heard(world, CHANNELS.ready).length, 2);
  world.emit(CHANNELS.register, registration());
  assert.equal(bus.registry.size, 1);
  bus.stop();
});

await test('an extension that registers in answer to ready is registered before start returns', () => {
  const world = fakeEvents();
  world.on(CHANNELS.ready, () => {
    world.emit(CHANNELS.register, registration());
  });
  const bus = new ExtensionBus(world, () => undefined);
  bus.start();
  assert.equal(bus.registry.size, 1);
  bus.stop();
});

await test('what is dropped is reported on the rejected channel, and bad messages never throw', () => {
  const world = fakeEvents();
  const bus = new ExtensionBus(world, () => undefined);
  bus.start();
  assert.doesNotThrow(() => {
    for (const message of [
      null,
      7,
      'x',
      {
        v: 1,
        ext: 'acme',
        label: 'A',
        items: [{ id: 'icon', region: 'row1.left', at: { xl: { text: 'x' } } }],
      },
    ])
      world.emit(CHANNELS.register, message);
    world.emit(CHANNELS.update, { v: 1, ext: 'nobody' });
    world.emit(CHANNELS.unregister, 12);
  });
  const rejected = heard(world, CHANNELS.rejected);
  assert.ok(rejected.length >= 4);
  assert.ok(rejected.every((entry) => JSON.stringify(entry.data).length < 5_000));
  assert.ok(rejected.some((entry) => (entry.data as { ext: string }).ext === 'acme'));
  bus.stop();
});

await test('a burst of messages asks for one redraw, not one each', async () => {
  const world = fakeEvents();
  let redraws = 0;
  const bus = new ExtensionBus(world, () => {
    redraws += 1;
  });
  bus.start();
  for (let index = 0; index < 50; index += 1)
    world.emit(CHANNELS.register, registration({ label: `Acme ${index}` }));
  await delay(250);
  assert.equal(redraws, 1);
  bus.stop();
});

await test('stopping forgets everything and stops listening; unregister removes one extension', () => {
  const world = fakeEvents();
  const bus = new ExtensionBus(world, () => undefined);
  bus.start();
  world.emit(CHANNELS.register, registration());
  world.emit(CHANNELS.register, registration({ ext: 'other' }));
  world.emit(CHANNELS.unregister, { v: 1, ext: 'other' });
  assert.deepEqual(
    bus.registry.all().map((entry) => entry.ext),
    ['acme'],
  );
  bus.stop();
  assert.equal(bus.registry.size, 0);
  world.emit(CHANNELS.register, registration());
  assert.equal(bus.registry.size, 0, 'no longer listening');
});

await test('clicks and setting changes go out as events, and a setting shows the picked value until the extension confirms', () => {
  const world = fakeEvents();
  const bus = new ExtensionBus(world, () => undefined);
  bus.start();
  world.emit(CHANNELS.register, registration());
  bus.click('acme', 'status', 'icon');
  assert.deepEqual(
    heard(world, CHANNELS.click).map((entry) => entry.data),
    [{ v: 1, ext: 'acme', item: 'status', token: 'icon' }],
  );
  bus.setting('acme', 'mode', 'full');
  assert.deepEqual(
    heard(world, CHANNELS.setting).map((entry) => entry.data),
    [{ v: 1, ext: 'acme', row: 'mode', value: 'full' }],
  );
  assert.equal(bus.registry.find('acme:status')?.registration.settings?.rows[0]?.current, 'full');
  world.emit(CHANNELS.update, { v: 1, ext: 'acme', settings: [{ row: 'mode', current: 'brief' }] });
  assert.equal(
    bus.registry.find('acme:status')?.registration.settings?.rows[0]?.current,
    'brief',
    'the extension has the last word',
  );
  bus.stop();
});
