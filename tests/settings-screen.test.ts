import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initTheme } from '@earendil-works/pi-coding-agent';
import { defaultSettings } from '../src/core/settings.js';
import type { Settings } from '../src/core/settings.js';
import { openSettingsScreen } from '../src/ui/settings-screen.js';
import { fakeContext, flat } from './support/settings-screen-fixtures.js';

initTheme();

await test('the screen shows groups, opens one, applies a change and reports back', async () => {
  const { ctx, state } = fakeContext();
  let settings: Settings = defaultSettings();
  const changes: Settings[] = [];
  const done = openSettingsScreen(ctx, {
    current: () => settings,
    windows: () => ['5h', 'month'],
    change: (next) => {
      settings = next;
      changes.push(next);
    },
  });
  const component = state.component;
  assert.ok(component);
  const top = flat(component.render(100));
  for (const label of ['Project and Git', 'Model', 'Limit usage', 'Icons'])
    assert.match(top, new RegExp(label, 'u'));
  assert.doesNotMatch(top, /Project folder\s+shown/u, 'items live inside their group');
  assert.match(top, /Esc to close/u, 'the top level closes');
  component.handleInput('\r');
  const inside = flat(component.render(100));
  assert.match(inside, /Project folder/u, 'the group opened');
  assert.match(inside, /Esc to go back/u, 'a group says how to go back');
  assert.doesNotMatch(inside, /Esc to cancel/u);
  component.handleInput('\r');
  assert.equal(changes.length, 1);
  assert.equal(settings.slots.workspace?.hideAt, 'lg', 'the first row cycles to the next value');
  component.handleInput('\u001b');
  const back = flat(component.render(100));
  assert.match(back, /Project and Git\s+1 changed/u, 'the group reports what changed');
  assert.equal(changes.length, 1, 'closing a group is not a change');
  assert.equal(state.closed, false);
  component.handleInput('\u001b');
  await done;
  assert.equal(state.closed, true);
});

await test('no list of the real menu changes height on arrow keys, and none carries spare lines', async () => {
  for (const width of [60, 100, 140]) {
    const { ctx, state } = fakeContext();
    const settings: Settings = defaultSettings();
    const closed = openSettingsScreen(ctx, {
      current: () => settings,
      windows: () => ['5h', 'week', 'month'],
      change: () => undefined,
    });
    const component = state.component;
    assert.ok(component);
    const heightsOf = (steps: number): Set<number> => {
      const heights = new Set<number>();
      for (let step = 0; step < steps; step += 1) {
        heights.add(component.render(width).length);
        component.handleInput('\u001b[B');
      }
      return heights;
    };
    assert.equal(heightsOf(14).size, 1, `top level at ${width} columns`);
    for (let group = 0; group < 5; group += 1) {
      component.handleInput('\r');
      const lines = flat(component.render(width)).split('\n');
      assert.equal(heightsOf(12).size, 1, `group ${group} at ${width} columns`);
      const hint = lines.findIndex((line) => line.includes('Esc to go back'));
      assert.match(lines[hint - 1] ?? 'x', /^$/u, 'one blank line before the hint');
      assert.match(lines[hint - 2] ?? '', /\S/u, 'and the description right above it, no gap');
      component.handleInput('\u001b');
      component.handleInput('\u001b[B');
    }
    component.handleInput('\u001b');
    await closed;
  }
});

await test('the menu is framed by two rules and titled, with a breadcrumb inside a group', async () => {
  const { ctx, state } = fakeContext();
  const closed = openSettingsScreen(ctx, {
    current: defaultSettings,
    windows: () => ['5h'],
    change: () => undefined,
  });
  const component = state.component;
  assert.ok(component);
  const top = flat(component.render(60)).split('\n');
  assert.match(top[0] ?? '', /^─+$/u, 'a rule above');
  assert.match(top[1] ?? '', /^ Footer Dock settings$/u, 'then the title');
  assert.match(top.at(-1) ?? '', /^─+$/u, 'and a rule below');
  for (let step = 0; step < 4; step += 1) component.handleInput('\u001b[B');
  component.handleInput('\r');
  const inside = flat(component.render(60)).split('\n');
  assert.match(inside[1] ?? '', /^ Footer Dock settings › Limit usage$/u);
  assert.equal(inside.filter((line) => /^─+$/u.test(line)).length, 2, 'one frame, not two');
  component.handleInput('\u001b');
  component.handleInput('\u001b');
  await closed;
});

await test("the frame uses Pi's own border and accent colours, not the list's dim hint", async () => {
  const { ctx, state } = fakeContext();
  const closed = openSettingsScreen(ctx, {
    current: defaultSettings,
    windows: () => [],
    change: () => undefined,
  });
  const component = state.component;
  assert.ok(component);
  component.render(60);
  assert.equal(state.colours.filter((colour) => colour === 'border').length, 2, 'both rules');
  assert.ok(state.colours.includes('accent'), 'the title');
  component.handleInput('\u001b');
  await closed;
});
