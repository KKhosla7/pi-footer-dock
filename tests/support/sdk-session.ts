import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  initTheme,
} from '@earendil-works/pi-coding-agent';
import type { AgentSession } from '@earendil-works/pi-coding-agent';
import { TuiMainScreen } from '@earendil-works/pi-tui';
import { MemoryTerminal } from './terminal.js';
import type { Component } from '@earendil-works/pi-tui';

// The footer reads its global settings from the agent directory: keep tests off the real one.
process.env.PI_CODING_AGENT_DIR ??= mkdtempSync(join(tmpdir(), 'dock-agent-'));
// The cost history keeps a rebuildable cache: keep it off the real one too.
process.env.XDG_CACHE_HOME ??= mkdtempSync(join(tmpdir(), 'dock-cache-'));

interface SessionOptions {
  paths?: string[];
  reasoning?: boolean;
  tools?: string[];
  /** USD-per-million rates by fixture provider; unlisted providers are priced at zero. */
  costs?: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }>;
}

export async function createStreamingSession(
  directory: string,
  baseUrl: string,
  manager?: SessionManager,
  extensions: string[] | SessionOptions = [],
) {
  const options: SessionOptions = Array.isArray(extensions) ? { paths: extensions } : extensions;
  const modelRuntime = await createFixtureRuntime(directory, baseUrl, options);
  const model = modelRuntime.getModel('integration-a', 'test-model');
  if (!model) throw new Error('Fixture provider registration failed');
  const settingsManager = SettingsManager.inMemory({
    cacheWarming: 'off',
    retry: { enabled: false },
    compaction: { reserveTokens: 2048 },
  });
  const resourceLoader = new DefaultResourceLoader({
    cwd: directory,
    agentDir: directory,
    settingsManager,
    additionalExtensionPaths: [resolve('src/index.ts'), ...(options.paths ?? [])],
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
  });
  await resourceLoader.reload();
  const result = await createAgentSession({
    cwd: directory,
    agentDir: directory,
    resourceLoader,
    modelRuntime,
    model,
    sessionManager: manager ?? SessionManager.inMemory(directory),
    settingsManager,
    tools: options.tools ?? [],
    ...(options.tools ? {} : { noTools: 'all' as const }),
    thinkingLevel: 'off',
  });
  return { session: result.session, modelRuntime };
}

async function createFixtureRuntime(
  directory: string,
  baseUrl: string,
  options: SessionOptions,
): Promise<ModelRuntime> {
  const runtime = await ModelRuntime.create({
    authPath: join(directory, 'auth.json'),
    modelsPath: null,
    modelsStorePath: join(directory, 'models-store.json'),
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
  for (const [provider, capacity] of [
    ['integration-a', 64_000],
    ['integration-b', 128_000],
  ] as const) {
    runtime.registerProvider(provider, {
      baseUrl,
      api: 'openai-completions',
      apiKey: 'fixture-only',
      models: [
        {
          id: 'test-model',
          name: 'Test model',
          input: ['text'],
          reasoning: options.reasoning ?? false,
          cost: options.costs?.[provider] ?? { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
          contextWindow: capacity,
          maxTokens: 1024,
        },
      ],
    });
  }
  return runtime;
}

/** Capture the actual extension footer; only terminal I/O is headless. */
export async function captureFooter(
  session: AgentSession,
  statuses: ReadonlyMap<string, string> = new Map(),
) {
  initTheme('dark');
  const runner = session.extensionRunner;
  const baseUI = runner.getUIContext();
  const tui = new TuiMainScreen(new MemoryTerminal());
  let footer: (Component & { dispose?(): void }) | undefined;
  const notifications: string[] = [];
  const errors: string[] = [];
  await session.bindExtensions({
    mode: 'tui',
    uiContext: {
      ...baseUI,
      setFooter: (factory) => {
        footer?.dispose?.();
        footer = factory?.(tui, baseUI.theme, {
          getGitBranch: () => null,
          getExtensionStatuses: () => statuses,
          getAvailableProviderCount: () => 0,
          onBranchChange: () => () => {
            /* No git in fixture. */
          },
        });
      },
      notify: (message) => {
        notifications.push(message);
      },
    },
    onError: (error) => {
      errors.push(error.error);
    },
  });
  return {
    render: (width = 140) => footer?.render(width) ?? [],
    notifications,
    errors,
    dispose: () => {
      footer?.dispose?.();
      tui.stop();
    },
  };
}
