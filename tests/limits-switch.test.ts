import assert from 'node:assert/strict';
import { test } from 'node:test';
import { choose, menuRows } from '../src/core/settings-menu.js';
import { defaultSettings, parseSettings } from '../src/core/settings.js';
import { QuotaController } from '../src/quota-controller.js';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';

await test('asking providers for limits is on by default, saved only when off, and refused for other values', () => {
  const row = menuRows(defaultSettings(), []).find((entry) => entry.id === 'limits');
  assert.equal(row?.current, 'on');
  const off = choose(defaultSettings(), 'limits', 'off');
  assert.equal(off.limits, 'off');
  assert.deepEqual(parseSettings(JSON.parse(JSON.stringify(off))).limits, 'off');
  assert.equal(
    'limits' in choose(off, 'limits', 'on'),
    false,
    'on is the default: nothing is stored',
  );
  assert.throws(() => parseSettings({ version: 1, limits: 'maybe', slots: {} }));
});

await test('with the switch off a provider that has a limit source is not asked and the footer says limits off', () => {
  let enabled = false;
  const pi = {
    appendEntry: () => undefined,
    events: { on: () => () => undefined, emit: () => undefined },
  } as unknown as ExtensionAPI;
  const ctx = {
    model: { provider: 'opencode-go', id: 'm' },
    sessionManager: { getBranch: () => [], getEntries: () => [] },
    modelRegistry: {},
  } as unknown as ExtensionContext;
  const controller = new QuotaController(
    pi,
    () => undefined,
    {},
    () => enabled,
  );
  controller.updateContext(ctx);
  assert.equal(controller.snapshot().status, 'limits off');
  assert.equal(controller.diagnostics().quotaProvider.lastAttemptAt, null, 'no request was made');
  enabled = true;
  assert.notEqual(controller.snapshot().status, 'limits off');
  controller.stop();
});
