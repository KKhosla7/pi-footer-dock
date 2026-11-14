import { appendFileSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';

const { Request } = globalThis;
const host = process.env.RIG_REDIRECT_HOST;
const to = process.env.RIG_REDIRECT_TO;
const note = (text) => process.env.RIG_DEBUG && appendFileSync(process.env.RIG_DEBUG, `${text}\n`);
if (host && to && /^http:\/\/127\.0\.0\.1:\d+$/u.test(to)) {
  let current = globalThis.fetch;
  const wrapped = (input, init) => {
    const original = input instanceof Request ? new URL(input.url) : new URL(String(input));
    note(`request ${original.hostname}${original.pathname}`);
    if (original.hostname !== host) return current(input, init);
    const local = new URL(original.pathname + original.search, to);
    return current(input instanceof Request ? new Request(local, input) : local, init);
  };
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    enumerable: true,
    get: () => wrapped,
    set: (value) => {
      note('fetch was reassigned by the program');
      current = value;
    },
  });
  note('redirect installed');
}
