import { createServer } from 'node:http';
import { once } from 'node:events';
import { emitResponses } from './responses-fixture.js';

/** Local wire-protocol fixture. Real HTTP/SSE, no paid provider or mocked Pi APIs. */
export async function startProviderServer(
  quotaEvent?: object,
  headers: Record<string, string> = {},
  wire: 'completions' | 'responses' = 'completions',
): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const server = createServer((request, response) => {
    request.resume();
    response.writeHead(200, { ...headers, 'content-type': 'text/event-stream' });
    const frame = (body: object): void => {
      if (wire === 'responses' && 'type' in body && typeof body.type === 'string')
        response.write(`event: ${body.type}\n`);
      response.write(`data: ${JSON.stringify(body)}\n\n`);
    };
    if (quotaEvent) frame(quotaEvent);
    if (wire === 'responses') {
      emitResponses(frame);
      response.end();
      return;
    }
    frame({
      id: 'response',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'fixture',
      choices: [
        {
          index: 0,
          delta: { role: 'assistant', content: 'Integration response.' },
          finish_reason: null,
        },
      ],
    });
    frame({
      id: 'response',
      object: 'chat.completion.chunk',
      created: 1,
      model: 'fixture',
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: {
        prompt_tokens: 1100,
        completion_tokens: 25,
        total_tokens: 1125,
        prompt_tokens_details: { cached_tokens: 200 },
      },
    });
    response.end('data: [DONE]\n\n');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing local server address');
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    close: () => closeServer(server),
  };
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
    server.closeAllConnections();
  });
}
