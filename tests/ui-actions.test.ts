import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createEventBus } from '@earendil-works/pi-coding-agent';
import { visibleWidth } from '@earendil-works/pi-tui';
import { actionChannels, UIActionRegistry } from '../src/core/ui-actions.js';

function fixture() {
  const bus = createEventBus();
  const registry = new UIActionRegistry(bus, new Set(['context']));
  const invoked: unknown[] = [];
  bus.on(actionChannels.invoke, (data) => invoked.push(data));
  return { bus, registry, invoked };
}

const advertisement = {
  version: 1,
  id: 'unrelated-vendor.inspect',
  target: 'context',
  label: 'Inspect context',
};
const cancel = () => Promise.resolve(undefined);

await test('consumer discovers early providers; late providers register without polling', async () => {
  for (const providerFirst of [true, false]) {
    const { bus, registry, invoked } = fixture();
    const install = () => {
      bus.on(actionChannels.discover, () => {
        bus.emit(actionChannels.register, advertisement);
      });
      bus.emit(actionChannels.register, advertisement);
    };
    if (providerFirst) install();
    registry.start();
    if (!providerFirst) install();
    assert.equal(registry.actions('context').length, 1);
    assert.equal(await registry.invoke('context', cancel), 'invoked');
    assert.deepEqual(invoked, [{ version: 1, id: advertisement.id }]);
    registry.stop();
  }
});

await test('registrations upsert, sanitize labels, ignore malformed/unsupported metadata and remove', () => {
  const { bus, registry, invoked } = fixture();
  registry.start();
  const invalid = [
    null,
    [],
    { ...advertisement, version: 2 },
    { ...advertisement, id: '' },
    { ...advertisement, id: 'bad\nname' },
    { ...advertisement, target: 'unsupported' },
    { ...advertisement, label: '\n\u001b' },
    { ...advertisement, label: 10 },
  ];
  for (const data of invalid) bus.emit(actionChannels.register, data);
  assert.equal(registry.actions('context').length, 0);
  bus.emit(actionChannels.register, advertisement);
  bus.emit(actionChannels.register, { ...advertisement, label: '\u001b\n' + '界'.repeat(100) });
  const actions = registry.actions('context');
  assert.equal(actions.length, 1);
  assert.ok(!actions[0]?.label.includes('\u001b'));
  assert.ok(visibleWidth(actions[0]?.label ?? '') <= 80);
  assert.deepEqual(invoked, []);
  bus.emit(actionChannels.unregister, { version: 2, id: advertisement.id });
  assert.equal(registry.actions('context').length, 1);
  bus.emit(actionChannels.unregister, { version: 1, id: advertisement.id });
  assert.equal(registry.actions('context').length, 0);
  registry.stop();
});

await test('no provider is harmless; one provider needs no selector; multiple select by label', async () => {
  const { bus, registry, invoked } = fixture();
  registry.start();
  assert.equal(await registry.invoke('context', cancel), 'unavailable');
  bus.emit(actionChannels.register, advertisement);
  assert.equal(
    await registry.invoke('context', () => Promise.reject(new Error('unexpected selector'))),
    'invoked',
  );
  bus.emit(actionChannels.register, {
    ...advertisement,
    id: 'other.open',
    label: 'Other context view',
  });
  assert.equal(await registry.invoke('context', cancel), 'cancelled');
  assert.equal(
    await registry.invoke('context', (labels) => {
      assert.deepEqual(labels, ['1. Inspect context', '2. Other context view']);
      return Promise.resolve(labels[1]);
    }),
    'invoked',
  );
  assert.deepEqual(invoked, [
    { version: 1, id: advertisement.id },
    { version: 1, id: 'other.open' },
  ]);
  registry.stop();
});

await test('removal or restart during a selector cancels stale invocation', async () => {
  for (const restart of [false, true]) {
    const { bus, registry, invoked } = fixture();
    registry.start();
    bus.emit(actionChannels.register, advertisement);
    bus.emit(actionChannels.register, { ...advertisement, id: 'other.open' });
    const result = registry.invoke('context', (labels) => {
      if (restart) registry.start();
      else bus.emit(actionChannels.unregister, { version: 1, id: advertisement.id });
      return Promise.resolve(labels[0]);
    });
    assert.equal(await result, 'cancelled');
    assert.deepEqual(invoked, []);
    registry.stop();
  }
});

await test('identical re-advertisements do not cancel an active label selector', async () => {
  const { bus, registry, invoked } = fixture();
  registry.start();
  bus.emit(actionChannels.register, advertisement);
  bus.emit(actionChannels.register, { ...advertisement, id: 'other.open' });
  const result = await registry.invoke('context', (labels) => {
    bus.emit(actionChannels.register, advertisement);
    return Promise.resolve(labels[0]);
  });
  assert.equal(result, 'invoked');
  assert.equal(invoked.length, 1);
  registry.stop();
});

await test('stop clears records/listeners; restart subscribes then rediscoveries exactly once', async () => {
  const { bus, registry, invoked } = fixture();
  let discoveries = 0;
  bus.on(actionChannels.discover, () => {
    discoveries += 1;
    bus.emit(actionChannels.register, advertisement);
  });
  registry.start();
  registry.stop();
  bus.emit(actionChannels.register, advertisement);
  assert.equal(registry.actions('context').length, 0);
  registry.start();
  assert.equal(discoveries, 2);
  assert.equal(registry.actions('context').length, 1);
  await registry.invoke('context', cancel);
  assert.equal(invoked.length, 1);
  registry.stop();
});
