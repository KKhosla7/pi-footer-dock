import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

/** Explicit loopback-only provider for isolated real-CLI validation. Never load in production. */
export default function (pi: ExtensionAPI): void {
  const baseUrl = process.env.PI_DOCK_TEST_BASE_URL;
  if (!baseUrl || !/^http:\/\/127\.0\.0\.1:\d+\/v1$/u.test(baseUrl))
    throw new Error('Telemetry CLI fixture requires an explicit loopback endpoint');
  pi.registerProvider('dock-fixture', {
    api: 'openai-completions',
    baseUrl,
    apiKey: 'fixture-only',
    models: [
      {
        id: 'test-model',
        name: 'Synthetic telemetry fixture',
        input: ['text'],
        reasoning: false,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 64_000,
        maxTokens: 1024,
        promptCache: { short: 300, long: 3600 },
      },
    ],
  });
}
