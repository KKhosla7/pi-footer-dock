import assert from 'node:assert/strict';
import { test } from 'node:test';
import { choose, menuRows } from '../src/core/settings-menu.js';
import { defaultSettings, parseSettings } from '../src/core/settings.js';
import { QuotaController } from '../src/quota-controller.js';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';

await test('asking providers for limits is off by default, saved only when on, and refused for other values', () => {
  const row = menuRows(defaultSettings(), []).find((entry) => entry.id === 'limits');
  assert.equal(row?.current, 'off');
  const on = choose(defaultSettings(), 'limits', 'on');
  assert.equal(on.limits, 'on');
  assert.deepEqual(parseSettings(JSON.parse(JSON.stringify(on))).limits, 'on');
  assert.equal(
    'limits' in choose(on, 'limits', 'off'),
    false,
    'off is the default: nothing is stored',
  );
  assert.equal(parseSettings({ version: 1, limits: 'off', slots: {} }).limits, 'off');
  assert.throws(() => parseSettings({ version: 1, limits: 'maybe', slots: {} }));
});

await test('with the switch off (the default) a provider that has a limit source is not asked and the footer says limits off', () => {
  let enabled = false; // the default
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
