import { setTimeout as sleep } from 'node:timers/promises';
import { SharedGate } from '../../src/adapters/shared-gate.js';

/** Child process for the cross-process gate test: wait for a common start time, then race. */
const [root = '', scope = '', startAt = '0', interval = '0'] = process.argv.slice(2);
const gate = new SharedGate({ root, flightMs: 30_000 });
await sleep(Math.max(0, Number(startAt) - Date.now()));
const reservation = await gate.reserve(scope, Number(interval));
if (reservation) {
  await gate.finish(scope, reservation.revision, {
    observation: {
      windows: [{ label: '5h', remainingPercent: 50, resetAt: 4_000_000_000 }],
      observedAt: Date.now(),
    },
    failure: 'none',
    httpStatus: 200,
    delayMs: Number(interval),
  });
}
process.send?.({ won: Boolean(reservation) });
process.exit(0);
