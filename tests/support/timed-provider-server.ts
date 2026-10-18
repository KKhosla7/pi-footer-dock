import { createServer } from 'node:http';
import type { RequestListener } from 'node:http';
import { once } from 'node:events';

interface Options {
  headerDelayMs?: number;
  bodyDelayMs?: number;
  prompt?: number;
  read?: number;
  write?: number;
  failAfter?: number;
}
type Schedule = (callback: () => void, delay: number) => void;

function handler(options: Options, schedule: Schedule, begin: () => number): RequestListener {
  return (request, response) => {
    const sequence = begin();
    request.resume();
    const frame = (body: object): void => {
      response.write(`data: ${JSON.stringify(body)}\n\n`);
    };
    schedule(() => {
      if (response.destroyed) return;
      if (options.failAfter !== undefined && sequence > options.failAfter) {
        response.writeHead(500, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ error: { message: 'Synthetic failure', type: 'fixture' } }));
        return;
      }
      response.writeHead(200, { 'content-type': 'text/event-stream' });
      const base = { id: 'timed-fixture', object: 'chat.completion.chunk', model: 'test-model' };
      frame({
        ...base,
        choices: [
          { index: 0, delta: { role: 'assistant', content: 'Fixture.' }, finish_reason: null },
        ],
      });
      schedule(() => {
        if (response.destroyed) return;
        frame({
          ...base,
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          usage: {
            prompt_tokens: options.prompt ?? 1100,
            completion_tokens: 25,
            prompt_tokens_details: {
              cached_tokens: options.read ?? 200,
              cache_write_tokens: options.write ?? 0,
            },
          },
        });
        response.end('data: [DONE]\n\n');
      }, options.bodyDelayMs ?? 80);
    }, options.headerDelayMs ?? 120);
  };
}

/** Local HTTP/SSE only; permits independent header and body latency. */
export async function startTimedProvider(options: Options = {}) {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  let requests = 0;
  const schedule: Schedule = (callback, delay) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      callback();
    }, delay);
    timers.add(timer);
  };
  const server = createServer(
    handler(options, schedule, () => {
      requests += 1;
      return requests;
    }),
  );
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture did not bind');
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requests: () => requests,
    close: async () => {
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
        server.closeAllConnections();
      });
    },
  };
}
