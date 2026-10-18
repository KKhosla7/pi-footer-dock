import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  actionChannels,
  MAX_UI_ACTIONS,
  MAX_UI_ACTIONS_PER_TARGET,
  UIActionRegistry,
} from '../src/core/ui-actions.js';

await test('registry has a hard cap while allowing existing providers to upsert at capacity', () => {
  const handlers = new Map<string, (value: unknown) => void>();
  const targets = ['context', 'input', 'output', 'cache', 'cost'];
  const registry = new UIActionRegistry(
    {
      on: (channel, handler) => {
        handlers.set(channel, handler);
        return () => {
          handlers.delete(channel);
        };
      },
      emit: () => {
        /* No providers are needed to test bounded admission. */
      },
    },
    new Set(targets),
  );
  registry.start();
  const register = handlers.get(actionChannels.register);
  assert.ok(register);
  for (let index = 0; index < 10_000; index += 1)
    register({
      version: 1,
      id: `provider-${index}`,
      target: targets[index % targets.length],
      label: `Provider ${index}`,
    });
  assert.equal(
    targets.reduce((sum, target) => sum + registry.actions(target).length, 0),
    MAX_UI_ACTIONS,
  );
  register({ version: 1, id: 'provider-0', target: 'context', label: 'Updated label' });
  assert.equal(registry.actions('context')[0]?.label, 'Updated label');
  registry.stop();
  assert.equal(registry.actions('context').length, 0);
  assert.equal(handlers.size, 0);
  registry.start();
  const fresh = handlers.get(actionChannels.register);
  assert.ok(fresh);
  for (let index = 0; index < 1000; index += 1)
    fresh({ version: 1, id: `context-${index}`, target: 'context', label: 'Context' });
  assert.equal(registry.actions('context').length, MAX_UI_ACTIONS_PER_TARGET);
  fresh({ version: 1, id: 'other', target: 'input', label: 'Original' });
  fresh({ version: 1, id: 'other', target: 'context', label: 'Cannot move into full target' });
  assert.equal(registry.actions('input')[0]?.label, 'Original');
  registry.stop();
});
