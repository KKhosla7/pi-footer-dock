import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ExtensionBus } from '../src/adapters/ext-bus.js';
import { CHANNELS } from '../src/core/ext/protocol.js';
import { explainDoc } from '../src/explain-item.js';
import { explainText } from '../src/explain-screen.js';
import { defaultFooterConfig } from '../src/core/footer-config.js';
import { portableGlyphs } from '../src/ui/glyphs.js';
import { demoSnapshot } from './reference.js';
import { registration } from './support/fake-registration.js';
import { screensHarness } from './support/interactions-harness.js';

function world(message: Record<string, unknown> = registration()) {
  const sent: { channel: string; data: unknown }[] = [];
  const handlers = new Map<string, ((data: unknown) => void)[]>();
  const events = {
    on: (channel: string, handler: (data: unknown) => void) => {
      handlers.set(channel, [...(handlers.get(channel) ?? []), handler]);
      return () => undefined;
    },
    emit: (channel: string, data: unknown) => {
      sent.push({ channel, data });
      for (const handler of handlers.get(channel) ?? []) handler(data);
    },
  };
  const bus = new ExtensionBus({ events }, () => undefined);
  bus.start();
  events.emit(CHANNELS.register, message);
  return { bus, sent: () => sent.filter((entry) => entry.channel === CHANNELS.click), events };
}

await test("the explanation of an extension item has Footer Dock's frame around what the extension supplied", () => {
  const { bus } = world();
  const doc = explainDoc('acme:status', {
    config: defaultFooterConfig(),
    snapshot: demoSnapshot,
    glyphs: portableGlyphs,
    extensions: bus.registry,
  });
  assert.ok(doc);
  const text = explainText(doc);
  assert.match(text, /Shows\s+• Acme: 3 jobs running/u);
  assert.match(text, /Now: available/u);
  assert.match(text, /Running\s+3/u);
  assert.match(text, /Load\s+[█░┃]+\s+40%/u);
  assert.match(text, /Job\s+State[\s\S]*build\s+running/u);
  assert.match(text, /What it reports[\s\S]*How many Acme jobs are running now/u);
  assert.match(text, /Can be missing when[\s\S]*Acme is not running/u);
  assert.match(text, /Provided by\s+Acme/u);
  assert.equal(doc.title, 'Acme jobs');
});

await test('an item without an explanation of its own still says what it is and who provides it', () => {
  const { bus } = world();
  const doc = explainDoc('acme:quiet', {
    config: defaultFooterConfig(),
    snapshot: demoSnapshot,
    glyphs: portableGlyphs,
    extensions: bus.registry,
  });
  assert.ok(doc);
  const text = explainText(doc);
  assert.match(text, /A value shown by Acme/u);
  assert.match(text, /Provided by\s+Acme/u);
  assert.equal(
    explainDoc('acme:missing', {
      config: defaultFooterConfig(),
      snapshot: demoSnapshot,
      glyphs: portableGlyphs,
      extensions: bus.registry,
    }),
    undefined,
  );
});

await test("clicking the icon sends one click event; clicking the text opens Footer Dock's explanation, and the same click closes it", async () => {
  const { bus, sent } = world();
  const { interactions, ctx, log, shown } = screensHarness(undefined, bus);
  await interactions.activate('acme:status:icon', ctx);
  assert.deepEqual(
    sent().map((entry) => entry.data),
    [{ v: 1, ext: 'acme', item: 'status', token: 'icon' }],
  );
  assert.equal(log.opened, 0, "the icon opened nothing of Footer Dock's");
  const open = interactions.activate('acme:status', ctx);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(log.opened, 1);
  assert.match(shown(0), /About Acme jobs/u);
  await interactions.activate('acme:status', ctx);
  await open;
  assert.equal(log.closed, 1);
  assert.equal(sent().length, 1, 'explaining sent no event');
});

await test('what a click does follows what the item declared: an event for the text, or nothing at all', async () => {
  const asEvent = world(
    registration({
      items: [
        { id: 'a', region: 'row1.left', at: { xl: { text: 'A' } }, clicks: { text: 'event' } },
      ],
    }),
  );
  const first = screensHarness(undefined, asEvent.bus);
  await first.interactions.activate('acme:a', first.ctx);
  assert.deepEqual(
    asEvent.sent().map((entry) => entry.data),
    [{ v: 1, ext: 'acme', item: 'a', token: 'text' }],
  );
  assert.equal(first.log.opened, 0);
  const none = world(
    registration({
      items: [
        { id: 'a', region: 'row1.left', at: { xl: { text: 'A' } }, clicks: { text: 'none' } },
      ],
    }),
  );
  const second = screensHarness(undefined, none.bus);
  await second.interactions.activate('acme:a', second.ctx);
  assert.equal(none.sent().length + second.log.opened, 0);
});
