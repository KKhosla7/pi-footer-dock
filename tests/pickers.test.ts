import assert from 'node:assert/strict';
import { test } from 'node:test';
import { modelChoices } from '../src/core/picker/model-choices.js';
import { supportedLevels, thinkingChoices } from '../src/core/picker/thinking-choices.js';
import { pickModel } from '../src/features/pickers/model-picker.js';
import { pickThinking } from '../src/features/pickers/thinking-picker.js';
import { fakePi } from './support/picker-harness.js';

const models = [
  { provider: 'openai-codex', id: 'gpt-6', name: 'GPT 6' },
  { provider: 'clinepass', id: 'cline-pass/glm-5.3', name: 'GLM 5.3' },
  { provider: 'opencode-go', id: 'deepseek-v4.1-flash', name: 'DeepSeek V4.1 Flash' },
  { provider: 'clinepass', id: 'cline-pass/kimi-k3', name: 'Kimi K3' },
];

await test('the model list is ordered like /model: current first, default second, then by provider', () => {
  const choices = modelChoices(
    models,
    { provider: 'opencode-go', id: 'deepseek-v4.1-flash' },
    { provider: 'openai-codex', model: 'gpt-6' },
  );
  assert.deepEqual(
    choices.map((choice) => choice.id),
    [
      'opencode-go/deepseek-v4.1-flash',
      'openai-codex/gpt-6',
      'clinepass/cline-pass/glm-5.3',
      'clinepass/cline-pass/kimi-k3',
    ],
  );
  assert.deepEqual(
    choices.map((choice) => [choice.current, choice.isDefault]),
    [
      [true, false],
      [false, true],
      [false, false],
      [false, false],
    ],
  );
  assert.match(choices[1]?.search ?? '', /default/u, 'the word default finds the default');
  assert.match(choices.at(2)?.search ?? '', /GLM 5\.3/u, 'the name is searchable too');
});

await test('thinking levels follow the rule Pi uses, and each carries its words, the current and the default', () => {
  assert.deepEqual(supportedLevels({ reasoning: false }), []);
  assert.deepEqual(supportedLevels({ reasoning: true }), [
    'off',
    'minimal',
    'low',
    'medium',
    'high',
  ]);
  assert.deepEqual(
    supportedLevels({ reasoning: true, thinkingLevelMap: { xhigh: 'x-high', minimal: null } }),
    ['off', 'low', 'medium', 'high', 'xhigh'],
  );
  assert.deepEqual(
    supportedLevels({ reasoning: true, thinkingLevelMap: { max: 'max', off: null } }),
    ['minimal', 'low', 'medium', 'high', 'max'],
  );
  const [off, low] = thinkingChoices(['off', 'low'], 'low', 'off');
  assert.ok(off && low);
  assert.equal(off.isDefault, true);
  assert.equal(low.current, true);
  assert.equal(low.description, 'Light reasoning (~2k tokens)');
});

await test('Enter on a model switches to it once; Esc, or the model already in use, switches nothing', async () => {
  const world = fakePi({ models, current: models[0] ?? { provider: '', id: '', name: '' } });
  const pending = pickModel(world.pi, world.ctx);
  assert.match(world.screen(), /✓ gpt-6 \[openai-codex\]/u);
  assert.match(world.screen(), /Model name: GPT 6/u);
  world.press('\u001b[B', '\r');
  await pending;
  assert.deepEqual(world.calls.setModel, ['clinepass/cline-pass/glm-5.3']);
  const same = fakePi({ models, current: models[0] ?? { provider: '', id: '', name: '' } });
  const stay = pickModel(same.pi, same.ctx);
  same.press('\r');
  await stay;
  assert.deepEqual(same.calls.setModel, []);
  const away = fakePi({ models });
  const closed = pickModel(away.pi, away.ctx);
  away.press('\u001b');
  await closed;
  assert.deepEqual(away.calls.setModel, []);
});

await test('typing in the model picker finds a model by id, provider or name, and Enter picks it', async () => {
  const world = fakePi({ models, current: models[0] ?? { provider: '', id: '', name: '' } });
  const pending = pickModel(world.pi, world.ctx);
  world.press(...Array.from('kimi'));
  assert.match(world.screen(), /kimi-k3 \[clinepass\]/u);
  assert.doesNotMatch(world.screen(), /gpt-6/u);
  world.press('\r');
  await pending;
  assert.deepEqual(world.calls.setModel, ['clinepass/cline-pass/kimi-k3']);
});

await test('a model without credentials is reported, not silently ignored; no models says how to add one', async () => {
  const world = fakePi({ models, setModelResult: false });
  const pending = pickModel(world.pi, world.ctx);
  world.press('\r');
  await pending;
  assert.match(world.calls.notices.join('\n'), /no credentials/u);
  const none = fakePi({});
  await pickModel(none.pi, none.ctx);
  assert.match(none.calls.notices.join('\n'), /\/login/u);
  assert.equal(none.opened(), 0);
});

await test("the thinking picker offers this model's levels, marks the current, and sets the one chosen", async () => {
  const current = { provider: 'p', id: 'm', name: 'M', reasoning: true };
  const world = fakePi({
    models,
    current,
    level: 'medium',
    settings: { defaultThinkingLevel: 'low' },
  });
  const pending = pickThinking(world.pi, world.ctx);
  assert.match(world.screen(), /✓ medium\s+Moderate reasoning \(~8k tokens\)/u);
  assert.match(world.screen(), /low\s+Light reasoning \(~2k tokens\) · default/u);
  world.press('\u001b[B', '\r');
  await pending;
  assert.deepEqual(world.calls.setLevel, ['high']);
  const same = fakePi({ models, current, level: 'medium' });
  const stay = pickThinking(same.pi, same.ctx);
  same.press('\r');
  await stay;
  assert.deepEqual(same.calls.setLevel, []);
});

await test('a model that cannot reason, or no model at all, opens nothing and says so', async () => {
  const plain = fakePi({
    models,
    current: { provider: 'p', id: 'm', name: 'M', reasoning: false },
  });
  await pickThinking(plain.pi, plain.ctx);
  assert.equal(plain.opened(), 0);
  assert.match(plain.calls.notices.join('\n'), /no thinking levels/u);
  const none = fakePi({ models });
  await pickThinking(none.pi, none.ctx);
  assert.equal(none.opened(), 0);
});
