import type { SnapshotSource } from '../src/adapters/snapshot.js';

type SessionEntry = ReturnType<SnapshotSource['sessionManager']['getEntries']>[number];
type SessionMessage = Extract<SessionEntry, { type: 'message' }>;
type AssistantMessage = Extract<SessionMessage['message'], { role: 'assistant' }>;
type Model = Omit<NonNullable<SnapshotSource['model']>, 'api'> & { api: AssistantMessage['api'] };

export function modelFixture(
  options: Pick<Model, 'provider' | 'id' | 'api' | 'contextWindow'>,
): Model {
  return {
    ...options,
    name: options.id,
    baseUrl: 'https://example.invalid',
    input: ['text'],
    reasoning: true,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    maxTokens: 16_384,
  };
}

export const providerModels = [
  modelFixture({
    provider: 'openai-codex',
    id: 'codex-test',
    api: 'openai-codex-responses',
    contextWindow: 272_000,
  }),
  modelFixture({
    provider: 'anthropic',
    id: 'claude-test',
    api: 'anthropic-messages',
    contextWindow: 200_000,
  }),
  modelFixture({
    provider: 'google',
    id: 'gemini-test',
    api: 'google-generative-ai',
    contextWindow: 1_000_000,
  }),
  modelFixture({
    provider: 'custom-local',
    id: 'local-test',
    api: 'openai-completions',
    contextWindow: 32_768,
  }),
];

export function assistantEntry(
  model: Model,
  id = 'response',
): SessionMessage & { message: AssistantMessage } {
  return {
    type: 'message',
    id,
    parentId: null,
    timestamp: '',
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: 'fixture response' }],
      api: model.api,
      provider: model.provider,
      model: model.id,
      usage: {
        input: 1_500,
        output: 250,
        cacheRead: 500,
        cacheWrite: 0,
        totalTokens: 2_250,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: 'stop',
      timestamp: 1,
    },
  };
}
