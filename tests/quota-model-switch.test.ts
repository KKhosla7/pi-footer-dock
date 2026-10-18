import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { QuotaContext } from '../src/quota-sources/contract.js';
import { QuotaController } from '../src/quota-controller.js';
import {
  GO,
  CLINE,
  clineBody,
  context,
  goBody,
  harness,
  reply,
  until,
} from './support/provider-quota-harness.js';

const pi = { appendEntry: () => undefined } as unknown as ExtensionAPI;

/** A session context for a model; `id` only changes the model, never the account. */
function session(provider: string, baseUrl: string, id: string): ExtensionContext {
  const made = context(provider, baseUrl);
  const model = { ...(made.ctx.model as object), id } as QuotaContext['model'];
  return {
    ...made.ctx,
    model,
    sessionManager: { getBranch: () => [] },
  } as unknown as ExtensionContext;
}
const controllerOf = (h: ReturnType<typeof harness>, changed: () => void = () => undefined) =>
  new QuotaController(pi, changed, h.options());

await test('changing model within one provider keeps the quota on screen at once, labelled for the new model', async (t) => {
  const h = harness(t, (_call, clock) => reply(goBody(clock)));
  const controller = controllerOf(h);
  controller.updateContext(session('opencode-go', GO, 'deepseek-v4.1-flash'));
  await until(() => controller.snapshot().limits !== null);
  const before = controller.snapshot().limits?.windows.map((window) => window.label);
  controller.updateContext(session('opencode-go', GO, 'glm-5.3-flash'));
  const now = controller.snapshot();
  assert.deepEqual(
    now.limits?.windows.map((window) => window.label),
    before,
    'no gap, no waiting for new data',
  );
  assert.equal(now.limits?.model, 'glm-5.3-flash');
  assert.equal(h.fetches.length, 1, 'and no extra request for the same account');
  controller.stop();
});

await test('a model whose provider has a quota source says "loading" at once, never "unsupported"', async (t) => {
  const h = harness(t, (_call, clock) => reply(goBody(clock)));
  const controller = controllerOf(h);
  controller.updateContext(session('anthropic', 'https://api.anthropic.com', 'sonnet'));
  assert.deepEqual(
    [controller.snapshot().limits, controller.snapshot().status],
    [null, null],
    'no source: nothing to say',
  );
  controller.updateContext(session('opencode-go', GO, 'glm-5.3-flash'));
  assert.equal(controller.snapshot().limits, null);
  assert.equal(controller.snapshot().status, 'quota loading');
  await until(() => controller.snapshot().limits !== null);
  controller.stop();
});

await test("another provider never shows the previous provider's windows; coming back reloads them from the gate without a request", async (t) => {
  const h = harness(t, (_call, clock) => reply(goBody(clock)));
  const controller = controllerOf(h);
  controller.updateContext(session('opencode-go', GO, 'glm-5.3-flash'));
  await until(() => controller.snapshot().limits !== null);
  controller.updateContext(session('anthropic', 'https://api.anthropic.com', 'sonnet'));
  assert.equal(controller.snapshot().limits, null, 'no windows of another provider');
  controller.updateContext(session('opencode-go', GO, 'glm-5.3-flash'));
  assert.equal(
    controller.snapshot().status,
    'quota loading',
    'never "unsupported" on the way back',
  );
  await until(() => controller.snapshot().limits !== null);
  assert.equal(h.fetches.length, 1, 'the shared observation was read; the server was not asked');
  controller.stop();
});

await test('every change reaches the footer, so it redraws when the quota arrives', async (t) => {
  const h = harness(t, (_call, clock) => reply(clineBody(clock)));
  let changes = 0;
  const controller = controllerOf(h, () => {
    changes += 1;
  });
  controller.updateContext(session('clinepass', CLINE, 'm'));
  await until(() => controller.snapshot().limits !== null);
  assert.ok(changes >= 1);
  controller.stop();
});
