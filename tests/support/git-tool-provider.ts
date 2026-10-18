import { createServer } from 'node:http';
import type { ServerResponse } from 'node:http';
import { once } from 'node:events';

/** Two real Pi write/edit calls, followed by a response held until the test releases it. */
export async function startGitToolProvider() {
  let requests = 0;
  let held: ServerResponse | undefined;
  const server = createServer((request, response) => {
    request.resume();
    requests += 1;
    if (requests === 3) {
      held = response;
      return;
    }
    const name = requests === 1 ? 'write' : 'edit';
    const args =
      requests === 1
        ? { path: 'new.txt', content: 'created by native Pi tool\n' }
        : { path: 'tracked.txt', oldText: 'fixture', newText: 'edited by native Pi tool' };
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    frame(response, {
      choices: [
        {
          index: 0,
          delta: {
            role: 'assistant',
            tool_calls: [
              {
                index: 0,
                id: `call-${requests}`,
                type: 'function',
                function: { name, arguments: JSON.stringify(args) },
              },
            ],
          },
          finish_reason: null,
        },
      ],
    });
    frame(response, {
      choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }],
      usage: { prompt_tokens: 30, completion_tokens: 5 },
    });
    response.end('data: [DONE]\n\n');
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture did not bind');
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requests: () => requests,
    held: () => held !== undefined,
    finish: () => {
      finish(held);
    },
    close: async () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) reject(error);
          else resolve();
        });
        server.closeAllConnections();
      }),
  };
}

function finish(response: ServerResponse | undefined): void {
  if (!response) throw new Error('Fixture response not held');
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  frame(response, {
    choices: [
      {
        index: 0,
        delta: { role: 'assistant', content: 'Native tool fixture complete.' },
        finish_reason: null,
      },
    ],
  });
  frame(response, {
    choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    usage: { prompt_tokens: 30, completion_tokens: 5 },
  });
  response.end('data: [DONE]\n\n');
}

function frame(response: ServerResponse, value: object): void {
  response.write(
    `data: ${JSON.stringify({ id: 'git-tool-fixture', object: 'chat.completion.chunk', model: 'test-model', ...value })}\n\n`,
  );
}
