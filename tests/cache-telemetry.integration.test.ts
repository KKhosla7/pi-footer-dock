import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stripVTControlCharacters } from 'node:util';
import { setImmediate } from 'node:timers/promises';
import { startTimedProvider } from './support/timed-provider-server.js';
import { captureFooter, createStreamingSession } from './support/sdk-session.js';

const config =
  '/dock-config ' +
  JSON.stringify({
    rows: [
      { left: ['model'], right: [] },
      { left: ['cache', 'speed'], right: [] },
    ],
    slots: { cache: { text: '{cachereuse} R{cacheread} W{cachewrite} U{cacheinput}' } },
  });

await test('default loaded cache shows latest-response values without configuring a template', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-cache-default-'));
  const server = await startTimedProvider({ prompt: 1000, read: 800, write: 100 });
  const { session } = await createStreamingSession(directory, server.baseUrl);
  const capture = await captureFooter(session);
  const render = () => capture.render().map(stripVTControlCharacters).join('\n');
  try {
    assert.match(render(), /cache pending/u);
    await session.prompt('Synthetic primary response with default footer.');
    const wide = capture.render(200).map(stripVTControlCharacters).join('\n');
    assert.match(wide, /last 80% · 800 read · 100 written/u);
    // At 110 columns the row cannot hold the full cache text and speed: cache shortens, speed stays.
    const narrow = capture.render(110).map(stripVTControlCharacters).join('\n');
    assert.match(narrow, /last 80%(?! ·)/u);
    assert.match(narrow, /tok\/s/u);
    assert.equal(capture.render().length, 2);
    await session.prompt('/dock-info cache');
    assert.match(capture.notifications.at(-1) ?? '', /Read\s+800 tokens/u);
    assert.match(capture.notifications.at(-1) ?? '', /Written\s+100 tokens/u);
    await session.prompt('/dock-glyphs');
    assert.match(render(), /cache pending/u);
    assert.equal(server.requests(), 1, 'display, help and glyph reset add no requests');
    assert.deepEqual(capture.errors, []);
  } finally {
    capture.dispose();
    session.dispose();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

await test('loaded cache templates/help follow primary completion and clear at model changes without extra calls', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-cache-live-'));
  const server = await startTimedProvider({ prompt: 1000, read: 800, write: 100 });
  const { session, modelRuntime } = await createStreamingSession(directory, server.baseUrl);
  const capture = await captureFooter(session);
  const render = () => capture.render().map(stripVTControlCharacters).join('\n');
  try {
    await session.prompt(config);
    assert.match(render(), /— R— W— U—/u);
    const branch = session.sessionManager.getLeafId();
    assert.ok(branch);
    await session.prompt('Synthetic primary response.');
    assert.match(render(), /80% R800 W100 U100/u);
    assert.match(render(), /tok\/s/u);
    await session.prompt('/dock-info cache');
    const help = capture.notifications.at(-1) ?? '';
    assert.match(help, /Read\s+800 tokens/u);
    assert.match(help, /Written\s+100 tokens/u);
    assert.match(help, /Lifetime\s+not declared/u);
    assert.equal(server.requests(), 1);
    const next = modelRuntime.getModel('integration-b', 'test-model');
    assert.ok(next);
    await session.setModel(next);
    assert.match(render(), /— R— W— U—/u);
    assert.doesNotMatch(render(), /tok\/s/u);
    await session.prompt('Synthetic response on new model.');
    assert.match(render(), /80% R800 W100 U100/u);
    assert.equal(server.requests(), 2);
    const navigation = await session.navigateTree(branch, { summarize: false });
    assert.equal(navigation.cancelled, false);
    assert.match(render(), /— R— W— U—/u);
    assert.doesNotMatch(render(), /tok\/s/u);
    assert.equal(server.requests(), 2, 'history navigation must not infer or replay requests');
    assert.equal(capture.render().length, 2);
    assert.deepEqual(capture.errors, []);
  } finally {
    capture.dispose();
    session.dispose();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

await test('changing thinking level keeps the last response figures, without an extra model request', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-cache-thinking-'));
  const server = await startTimedProvider({ prompt: 1000, read: 800, write: 100 });
  const { session } = await createStreamingSession(directory, server.baseUrl, undefined, {
    reasoning: true,
  });
  const capture = await captureFooter(session);
  try {
    await session.prompt(config);
    await session.prompt('Synthetic reasoning-capable response.');
    assert.match(capture.render().join('\n'), /80% R800 W100 U100/u);
    session.setThinkingLevel('low');
    await setImmediate();
    const footer = capture.render().map(stripVTControlCharacters).join('\n');
    assert.equal(session.thinkingLevel, 'low');
    assert.match(footer, /80% R800 W100 U100/u);
    assert.match(footer, /tok\/s/u);
    assert.equal(server.requests(), 1);
    assert.deepEqual(capture.errors, []);
  } finally {
    capture.dispose();
    session.dispose();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});

await test('loaded cache view does not turn normalized zero into a confirmed miss or expiry', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dock-cache-zero-'));
  const server = await startTimedProvider({ prompt: 1000, read: 0, write: 0 });
  const { session } = await createStreamingSession(directory, server.baseUrl);
  const capture = await captureFooter(session);
  try {
    await session.prompt(config);
    await session.prompt('Synthetic zero-reuse response.');
    const footer = capture.render().map(stripVTControlCharacters).join('\n');
    assert.match(footer, /— R0 W0 U1k/u);
    await session.prompt('/dock-info cache');
    const help = capture.notifications.at(-1) ?? '';
    assert.match(help, /Last response\s+\S+\s+not reported/u);
    assert.match(help, /has not reported any cache reads/u);
    assert.match(help, /Lifetime\s+not declared/u);
    assert.equal(server.requests(), 1);
    assert.deepEqual(capture.errors, []);
  } finally {
    capture.dispose();
    session.dispose();
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
