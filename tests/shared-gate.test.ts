import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { SharedGate } from '../src/adapters/shared-gate.js';
import type { GateResult } from '../src/adapters/shared-gate.js';
import { quotaIdentity, quotaRoot } from './support/quota-fixtures.js';

const scope = quotaIdentity('gate-scope');
function success(delayMs: number, observedAt = 0): GateResult {
  return {
    observation: {
      windows: [{ label: '5h', remainingPercent: 80, resetAt: 4_000_000_000 }],
      observedAt,
    },
    failure: 'none',
    httpStatus: 200,
    delayMs,
  };
}
const stateFile = (root: string): string => join(root, `${scope}.json`);

await test('one request is admitted per interval; others only read the shared state', async (t) => {
  const root = quotaRoot(t);
  let now = 1_000_000;
  const gate = new SharedGate({ root, now: () => now, flightMs: 5000 });
  assert.equal(await gate.view(scope), undefined);
  const first = await gate.reserve(scope, 1000);
  assert.ok(first);
  assert.equal(await gate.reserve(scope, 1000), undefined, 'a flight in progress admits nobody');
  assert.equal(await gate.finish(scope, 'not-the-owner', success(1000)), false);
  assert.equal(await gate.finish(scope, first.revision, success(1000, now)), true);
  now += 500;
  assert.equal(await gate.reserve(scope, 1000), undefined, 'inside the interval');
  now += 600;
  assert.ok(await gate.reserve(scope, 1000), 'after the interval');
  const view = await gate.view(scope);
  assert.equal(view?.attempts, 2);
  assert.equal(view.observation?.windows[0]?.remainingPercent, 80);
});

await test('an expired flight can be taken over and the old owner is fenced out', async (t) => {
  const root = quotaRoot(t);
  let now = 5_000_000;
  const gate = new SharedGate({ root, now: () => now, flightMs: 5000 });
  const stale = await gate.reserve(scope, 1000);
  assert.ok(stale);
  now += 6000;
  const takeover = await gate.reserve(scope, 1000);
  assert.ok(takeover);
  assert.equal(await gate.finish(scope, stale.revision, success(1000, now)), false);
  assert.equal((await gate.view(scope))?.observation, null, 'the stale result was not stored');
  assert.equal(await gate.finish(scope, takeover.revision, success(1000, now)), true);
});

await test('corrupt, oversized or out-of-range state is ignored, not trusted', async (t) => {
  const root = quotaRoot(t);
  const gate = new SharedGate({ root, now: () => 9_000_000 });
  writeFileSync(stateFile(root), 'not json', { mode: 0o600 });
  assert.equal(await gate.view(scope), undefined);
  writeFileSync(stateFile(root), JSON.stringify({ padding: 'x'.repeat(20_000) }), { mode: 0o600 });
  assert.equal(await gate.view(scope), undefined);
  assert.ok(await gate.reserve(scope, 1000), 'unusable state does not wedge admission');
  const good = JSON.parse(readFileSync(stateFile(root), 'utf8')) as Record<string, unknown>;
  const hostile = {
    ...good,
    observation: { observedAt: 1, windows: [{ label: 'x', remainingPercent: 500, resetAt: 5 }] },
  };
  writeFileSync(stateFile(root), JSON.stringify(hostile), { mode: 0o600 });
  assert.equal(await gate.view(scope), undefined);
});

await test('a wild clock jump cannot lock admission out for longer than an hour', async (t) => {
  const root = quotaRoot(t);
  let now = 2_000_000_000;
  const gate = new SharedGate({ root, now: () => now, flightMs: 1000 });
  const taken = await gate.reserve(scope, 1000);
  assert.ok(taken);
  await gate.finish(scope, taken.revision, success(1000, now));
  const state = JSON.parse(readFileSync(stateFile(root), 'utf8')) as Record<string, number>;
  writeFileSync(
    stateFile(root),
    JSON.stringify({ ...state, nextEligibleAt: now + 365 * 86_400_000 }),
    { mode: 0o600 },
  );
  now += 3_500_000;
  assert.equal(await gate.reserve(scope, 1000), undefined, 'still inside the clamp');
  now += 200_000;
  assert.ok(await gate.reserve(scope, 1000), 'admitted once the clamp has passed');
});

await test('state written in the future after the clock moved back never blocks', async (t) => {
  const root = quotaRoot(t);
  let now = 2_000_000_000_000;
  const gate = new SharedGate({ root, now: () => now, flightMs: 1000 });
  const taken = await gate.reserve(scope, 60_000);
  assert.ok(taken);
  await gate.finish(scope, taken.revision, success(60_000, now));
  assert.equal(await gate.reserve(scope, 60_000), undefined, 'inside the interval');
  now -= 86_400_000;
  assert.ok(await gate.reserve(scope, 60_000), 'a day-old clock rewind does not wedge admission');
});

await test('storage is private and an unsafe directory is refused', async (t) => {
  const root = quotaRoot(t);
  const gate = new SharedGate({ root });
  const reservation = await gate.reserve(scope, 1000);
  assert.ok(reservation);
  if (process.platform !== 'win32') {
    assert.equal(statSync(stateFile(root)).mode & 0o777, 0o600);
    assert.equal(statSync(root).mode & 0o777, 0o700);
    chmodSync(root, 0o755);
    await assert.rejects(new SharedGate({ root }).view(scope), /Unsafe quota directory/u);
  }
  await assert.rejects(gate.view('../escape'), /Invalid quota scope/u);
});

await test('a lock left by a dead process or an expired holder never blocks admission', async (t) => {
  const root = quotaRoot(t);
  const lock = `${stateFile(root)}.lock`;
  const gate = new SharedGate({ root, lockStaleMs: 200 });
  await gate.view(scope);
  writeFileSync(lock, `2147483646:${Date.now()}`, { mode: 0o600 });
  const first = await gate.reserve(scope, 1);
  assert.ok(first, 'holder process is gone');
  assert.equal(existsSync(lock), false);
  await gate.finish(scope, first.revision, success(1, Date.now()));
  await sleep(5);
  writeFileSync(lock, `${process.pid}:${Date.now() - 5000}`, { mode: 0o600 });
  assert.ok(await gate.reserve(scope, 1), 'holder is alive but the lock is past its lifetime');
});

await test('a fresh lock held by a live process is respected, then given up on', async (t) => {
  const root = quotaRoot(t);
  const gate = new SharedGate({ root });
  await gate.view(scope);
  const lock = `${stateFile(root)}.lock`;
  writeFileSync(lock, `${process.pid}:${Date.now()}`, { mode: 0o600 });
  const started = Date.now();
  assert.equal(await gate.reserve(scope, 1), undefined, 'caller reads instead of waiting forever');
  assert.ok(Date.now() - started >= 1000 && Date.now() - started < 4000);
  assert.ok(existsSync(lock), 'a live holder keeps its lock');
});

const child = fileURLToPath(new URL('./support/gate-child.ts', import.meta.url));
function race(root: string, interval: number): Promise<boolean[]> {
  const startAt = Date.now() + 2500;
  return Promise.all(
    Array.from(
      { length: 8 },
      () =>
        new Promise<boolean>((resolve, reject) => {
          const process_ = fork(child, [root, scope, String(startAt), String(interval)], {
            execArgv: ['--import', 'tsx'],
            stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
          });
          process_.once('message', (message) => {
            resolve(Boolean((message as { won?: boolean }).won));
          });
          process_.once('error', reject);
        }),
    ),
  );
}

await test('eight real processes racing admit exactly one request per interval', async (t) => {
  const root = quotaRoot(t);
  const first = await race(root, 4000);
  assert.equal(first.filter(Boolean).length, 1, 'round one admits exactly one process');
  await sleep(2000);
  const second = await race(root, 4000);
  assert.equal(second.filter(Boolean).length, 1, 'round two admits exactly one process');
  const state = JSON.parse(readFileSync(stateFile(root), 'utf8')) as { attempts: number };
  assert.equal(state.attempts, 2);
  assert.ok(!existsSync(`${stateFile(root)}.lock`), 'no lock is left behind');
});
