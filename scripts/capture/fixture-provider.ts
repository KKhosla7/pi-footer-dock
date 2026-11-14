import { createServer } from 'node:http';

const REPLY = [
  "I'll add the validation next to the existing login handler and keep the error messages",
  'the form already uses.',
  '',
  '```ts',
  'export function validateLogin(email: string, password: string): string[] {',
  '  const problems: string[] = [];',
  "  if (!/^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$/u.test(email)) problems.push('Enter a valid email address.');",
  "  if (password.length < 12) problems.push('Use at least 12 characters.');",
  '  return problems;',
  '}',
  '```',
  '',
  'Tests for both rules are in `tests/login.test.ts`.',
].join('\n');

const resetAt = Math.floor(Date.now() / 1000);
const chunk = (model: string, delta: object, finish: string | null, usage?: object) =>
  `data: ${JSON.stringify({
    id: 'demo',
    object: 'chat.completion.chunk',
    created: 1,
    model,
    choices: [{ index: 0, delta, finish_reason: finish }],
    ...(usage ? { usage } : {}),
  })}\n\n`;

const requestedModel = (body: string): string => {
  try {
    const model = (JSON.parse(body) as { model?: unknown }).model;
    return typeof model === 'string' ? model : 'demo';
  } catch {
    return 'demo';
  }
};

const clineUsage = () =>
  JSON.stringify({
    data: {
      limits: [
        {
          type: 'five_hour',
          percentUsed: 24,
          resetsAt: new Date((resetAt + 2 * 3600 + 14 * 60) * 1000).toISOString(),
        },
        {
          type: 'weekly',
          percentUsed: 50,
          resetsAt: new Date((resetAt + 3 * 86_400) * 1000).toISOString(),
        },
        {
          type: 'monthly',
          percentUsed: 70,
          resetsAt: new Date((resetAt + 19 * 86_400) * 1000).toISOString(),
        },
      ],
    },
  });

const server = createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/api/v1/users/me/plan/usage-limits') {
    request.resume();
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(clineUsage());
    return;
  }
  const received: Buffer[] = [];
  request.on('data', (part: Buffer) => received.push(part));
  request.on('end', () => {
    const model = requestedModel(Buffer.concat(received).toString('utf8'));
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    if (model === 'example-coder') {
      response.write(
        `data: ${JSON.stringify({
          type: 'codex.rate_limits',
          rate_limits: {
            primary: {
              used_percent: 38,
              window_minutes: 300,
              reset_at: resetAt + 2 * 3600 + 14 * 60,
            },
            secondary: { used_percent: 61, window_minutes: 10_080, reset_at: resetAt + 3 * 86_400 },
          },
        })}\n\n`,
      );
    }
    const words = REPLY.split(/(?<= )/u);
    let index = 0;
    const timer = setInterval(() => {
      const next = words[index];
      index += 1;
      if (next === undefined) {
        clearInterval(timer);
        response.write(
          chunk(model, {}, 'stop', {
            prompt_tokens: 38_400,
            completion_tokens: 612,
            total_tokens: 39_012,
            prompt_tokens_details: { cached_tokens: 31_200 },
          }),
        );
        response.end('data: [DONE]\n\n');
        return;
      }
      response.write(
        chunk(model, index === 1 ? { role: 'assistant', content: next } : { content: next }, null),
      );
    }, 85);
  });
});
server.listen(Number(process.argv[2] ?? 0), '127.0.0.1');
