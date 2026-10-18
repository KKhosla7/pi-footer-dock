process.env.TZ = 'America/New_York';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseContribution, parseHeader } from '../src/core/history/entry.js';
import { addRow, gapBucket, projectLabel } from '../src/core/history/rows.js';
import type { HistoryRow } from '../src/core/history/rows.js';
import { emptyState, feedLine } from '../src/core/history/scan.js';
import { NO_PRICES } from '../src/core/price-source.js';
import { tablePrices } from './support/prices.js';
import { response, usage } from './support/history-lines.js';

const project = { key: 'abc', label: 'demo' };
const context = { project, prices: NO_PRICES };

await test('idle gaps fall into the five buckets at their edges', () => {
  assert.deepEqual(
    [null, 0, 60_000, 60_001, 300_000, 300_001, 3_600_000, 3_600_001].map(gapBucket),
    ['first', '1m', '1m', '5m', '5m', '1h', '1h', 'long'],
  );
});

await test('a folder label is cleaned of controls and cut to forty characters', () => {
  assert.equal(projectLabel('/home/u/Projects/demo/'), 'demo');
  assert.equal(projectLabel('/x/evil\u001b[31m\nname‮'), 'evil[31mname');
  assert.equal(projectLabel('/x/' + 'a'.repeat(100)).length, 40);
  assert.equal(projectLabel('/'), '/');
  assert.equal(projectLabel('\u0001'), '(unnamed)');
});

await test('rows with one key merge, and sums saturate rather than overflow', () => {
  const rows = new Map<string, HistoryRow>();
  const base: HistoryRow = {
    day: '2026-10-01',
    project: 'a',
    provider: 'p',
    model: 'm',
    api: 'x',
    gap: '1m',
    responses: 1,
    input: 5,
    output: 1,
    read: 2,
    write: 0,
    cost: 0.5,
    unpriced: 0,
  };
  addRow(rows, base);
  addRow(rows, { ...base, input: Number.MAX_SAFE_INTEGER });
  addRow(rows, { ...base, gap: 'long' });
  assert.equal(rows.size, 2);
  const merged = [...rows.values()].find((row) => row.gap === '1m');
  assert.ok(merged);
  assert.equal(merged.responses, 2);
  assert.equal(merged.input, Number.MAX_SAFE_INTEGER);
  assert.equal(merged.cost, 1);
});

await test('a log header gives the folder and version; anything else is not a header', () => {
  assert.deepEqual(
    parseHeader('{"type":"session","version":3,"id":"x","timestamp":"t","cwd":"/work/demo"}'),
    { cwd: '/work/demo', version: 3 },
  );
  for (const bad of [
    '{"type":"message"}',
    'not json',
    '{"type":"session","cwd":5,"version":1}',
    '{"type":"session","cwd":"","version":1}',
  ])
    assert.equal(parseHeader(bad), undefined);
});

await test("a response line becomes tokens and Pi's recorded cost; lines without usage are ignored", () => {
  const item = parseContribution(
    response(
      '2026-10-01T12:00:10.000Z',
      Date.parse('2026-10-01T12:00:05.000Z'),
      usage({ input: 100, read: 800, write: 0, output: 25, total: 0.2 }),
    ),
    NO_PRICES,
  );
  assert.ok(item && item !== 'invalid');
  assert.deepEqual(item.usage, { input: 100, output: 25, cacheRead: 800, cacheWrite: 0 });
  assert.equal(item.cost, 0.2);
  assert.equal(item.provider, 'p');
  assert.equal(
    parseContribution('{"type":"message","message":{"role":"user","content":"hi"}}', NO_PRICES),
    undefined,
  );
  assert.equal(
    parseContribution('{"type":"session","cwd":"/x","version":1}', NO_PRICES),
    undefined,
  );
});

await test('a line that claims usage but cannot be read is invalid, never counted', () => {
  assert.equal(parseContribution('{"usage": truncated', NO_PRICES), 'invalid');
  assert.equal(
    parseContribution(
      '{"type":"usage","timestamp":"nope","usage":{"input":1,"output":1,"cacheRead":0,"cacheWrite":0}}',
      NO_PRICES,
    ),
    'invalid',
  );
  assert.equal(
    parseContribution(
      response('2026-10-01T12:00:10.000Z', 1, {
        ...usage({ input: 1, read: 0, write: 0, output: 1, total: 0 }),
        input: -5,
      }),
      NO_PRICES,
    ),
    'invalid',
  );
});

await test('an unpriced response keeps its tokens and counts as unpriced, not as free', () => {
  const zero = {
    ...usage({ input: 100, read: 0, write: 0, output: 10, total: 0 }),
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
  const state = emptyState();
  feedLine(state, response('2026-10-01T12:00:10.000Z', 1, zero), context);
  const row = [...state.rows.values()][0];
  assert.ok(row);
  assert.equal(row.cost, 0);
  assert.equal(row.unpriced, 1);
  assert.equal(row.input, 100);
  const priced = emptyState();
  feedLine(priced, response('2026-10-01T12:00:10.000Z', 1, zero), {
    project,
    prices: tablePrices({ 'p/m': { input: 1, output: 2, cacheRead: 0.5, cacheWrite: 1 } }),
  });
  assert.equal([...priced.rows.values()][0]?.unpriced, 0);
  assert.ok(([...priced.rows.values()][0]?.cost ?? 0) > 0);
});

await test('the idle gap is measured from the end of the previous response to the start of this one', () => {
  const state = emptyState();
  const at = (iso: string) => Date.parse(iso);
  feedLine(
    state,
    response(
      '2026-10-01T12:00:10.000Z',
      at('2026-10-01T12:00:05.000Z'),
      usage({ input: 10, read: 0, write: 0, output: 1, total: 0.01 }),
    ),
    context,
  );
  feedLine(
    state,
    response(
      '2026-10-01T12:00:20.000Z',
      at('2026-10-01T12:00:12.000Z'),
      usage({ input: 10, read: 90, write: 0, output: 1, total: 0.01 }),
    ),
    context,
  );
  feedLine(
    state,
    response(
      '2026-10-01T14:30:00.000Z',
      at('2026-10-01T14:29:50.000Z'),
      usage({ input: 10, read: 5, write: 0, output: 1, total: 0.01 }),
    ),
    context,
  );
  const gaps = [...state.rows.values()].map((row) => row.gap).sort();
  assert.deepEqual(gaps, ['1m', 'first', 'long']);
});

await test('feeding the same lines again from scratch gives the same rows (idempotent)', () => {
  const lines = [
    response(
      '2026-10-01T12:00:10.000Z',
      1,
      usage({ input: 10, read: 0, write: 0, output: 1, total: 0.01 }),
    ),
    response(
      '2026-10-02T12:00:10.000Z',
      2,
      usage({ input: 20, read: 40, write: 0, output: 2, total: 0.02 }),
    ),
  ];
  const run = () => {
    const state = emptyState();
    for (const line of lines) feedLine(state, line, context);
    return JSON.stringify([...state.rows.entries()].sort());
  };
  assert.equal(run(), run());
});

await test('days are local: a response at 23:30 New York time belongs to that day, not the next UTC day', () => {
  const state = emptyState();
  feedLine(
    state,
    response(
      '2026-10-02T03:30:00.000Z',
      1,
      usage({ input: 1, read: 0, write: 0, output: 1, total: 0.01 }),
    ),
    context,
  );
  assert.equal([...state.rows.values()][0]?.day, '2026-10-01');
});
