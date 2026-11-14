import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initTheme } from '@earendil-works/pi-coding-agent';
import { defaultSettings } from '../src/core/settings.js';
import type { Settings } from '../src/core/settings.js';
import { openSettingsScreen } from '../src/ui/settings-screen.js';
import { fakeContext, flat, selectRow } from './support/settings-screen-fixtures.js';

initTheme();

await test('"Collapse windows" opens its own list: a breadcrumb, the mode, a row per window, and back out', async () => {
  const { ctx, state } = fakeContext();
  let settings: Settings = defaultSettings();
  const closed = openSettingsScreen(ctx, {
    current: () => settings,
    windows: () => ['5h', 'week', 'month'],
    change: (next) => {
      settings = next;
    },
  });
  const component = state.component;
  assert.ok(component);
  selectRow(component, 'Limit usage');
  component.handleInput('\r');
  selectRow(component, 'Collapse windows');
  assert.match(
    flat(component.render(100)),
    /Collapse windows\s+when tight/u,
    'the group shows the mode',
  );
  component.handleInput('\r');
  const inside = flat(component.render(100));
  assert.match(
    inside,
    /Footer Dock settings › Limit usage › Collapse windows/u,
    'a full breadcrumb',
  );
  assert.equal(inside.match(/^─+$/gmu)?.length, 2, 'one frame, not three');
  for (const label of ['5h', 'week', 'month'])
    assert.match(inside, new RegExp(`Keep ${label}`, 'u'));
  assert.match(inside, /Esc to go back/u);
  selectRow(component, 'Keep month');
  component.handleInput('\r');
  assert.deepEqual([...(settings.slots.quota?.collapsedShow ?? [])].sort(), [
    '5h',
    'month',
    'week',
  ]);
  component.handleInput('\u001b');
  const back = flat(component.render(100));
  assert.match(back, /Footer Dock settings › Limit usage$/mu, 'back in Limit usage');
  assert.doesNotMatch(back, /Collapse windows\s*$/mu);
  component.handleInput('\u001b');
  component.handleInput('\u001b');
  await closed;
  assert.equal(state.closed, true);
});

await test('no list of the nested menu changes height on arrow keys at any depth', async () => {
  for (const width of [60, 100]) {
    const { ctx, state } = fakeContext();
    const closed = openSettingsScreen(ctx, {
      current: defaultSettings,
      windows: () => ['5h', 'week', 'month'],
      change: () => undefined,
    });
    const component = state.component;
    assert.ok(component);
    const heights = (steps: number): Set<number> => {
      const seen = new Set<number>();
      for (let step = 0; step < steps; step += 1) {
        seen.add(component.render(width).length);
        component.handleInput('\u001b[B');
      }
      return seen;
    };
    selectRow(component, 'Limit usage', width);
    component.handleInput('\r');
    selectRow(component, 'Collapse windows', width);
    component.handleInput('\r');
    assert.equal(heights(12).size, 1, `Collapse windows list at ${width} columns`);
    component.handleInput('\u001b');
    component.handleInput('\u001b');
    component.handleInput('\u001b');
    await closed;
  }
});
