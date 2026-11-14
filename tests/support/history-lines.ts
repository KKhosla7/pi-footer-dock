export interface Amounts {
  input: number;
  read: number;
  write: number;
  output: number;
  total: number;
}
export const usage = ({ input, read, write, output, total }: Amounts) => ({
  input,
  output,
  cacheRead: read,
  cacheWrite: write,
  totalTokens: input + read + write + output,
  cost: { input: total / 4, output: total / 4, cacheRead: total / 4, cacheWrite: total / 4, total },
});
export const response = (
  end: string,
  start: number,
  body: ReturnType<typeof usage>,
  extra: object = {},
): string =>
  JSON.stringify({
    type: 'message',
    id: end,
    parentId: null,
    timestamp: end,
    message: {
      role: 'assistant',
      provider: 'p',
      model: 'm',
      api: 'openai-completions',
      timestamp: start,
      usage: body,
      ...extra,
    },
  });
