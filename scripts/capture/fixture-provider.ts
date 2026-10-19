/**
 * A local stand-in for a model provider, used only to take the README pictures: it answers every
 * request with a short, realistic reply, token counts with cache hits, and one rate-limit event so
 * the footer has limit windows to show. No account, no network. Usage: tsx fixture-provider.ts <port>
 */
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
const chunk = (delta: object, finish: string | null, usage?: object) =>
  `data: ${JSON.stringify({
    id: 'demo',
    object: 'chat.completion.chunk',
    created: 1,
    model: 'example-coder',
    choices: [{ index: 0, delta, finish_reason: finish }],
    ...(usage ? { usage } : {}),
  })}\n\n`;

const server = createServer((request, response) => {
  request.resume();
  response.writeHead(200, { 'content-type': 'text/event-stream' });
  response.write(
    `data: ${JSON.stringify({
      type: 'codex.rate_limits',
      rate_limits: {
        primary: { used_percent: 38, window_minutes: 300, reset_at: resetAt + 2 * 3600 + 14 * 60 },
        secondary: { used_percent: 61, window_minutes: 10_080, reset_at: resetAt + 3 * 86_400 },
      },
    })}\n\n`,
  );
  const words = REPLY.split(/(?<= )/u);
  let index = 0;
  const timer = setInterval(() => {
    const next = words[index];
    index += 1;
    if (next === undefined) {
      clearInterval(timer);
      response.write(
        chunk({}, 'stop', {
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
      chunk(index === 1 ? { role: 'assistant', content: next } : { content: next }, null),
    );
  }, 85);
});
server.listen(Number(process.argv[2] ?? 0), '127.0.0.1');
