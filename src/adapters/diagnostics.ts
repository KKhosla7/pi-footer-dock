import { homedir } from 'node:os';
import { basename } from 'node:path';
import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { quotaSources } from '../quota-sources/registry.js';
import type { Snapshot } from '../core/model.js';
import { readTotals } from './snapshot.js';
import { record } from '../core/usage-values.js';
import type { ProviderQuotaService } from './provider-quota-service.js';
import type { OpenAIHeaderQuota } from './openai-header-quota.js';
import type { GitMonitor } from './git-monitor.js';

const fileName = (path: string | undefined): string | undefined =>
  path === undefined ? undefined : basename(path);

/** Where the extension runs from, without saying where on the disk. */
export const runsFrom = (moduleUrl: string): string =>
  moduleUrl.includes('/node_modules/') ? 'installed package' : 'development checkout';

/** The report is pasted into bug reports: the home folder (which carries the user name) becomes `~`. */
export function withoutPersonalPaths(text: string): string {
  const home = homedir();
  return home.length > 3 ? text.split(home).join('~') : text;
}

function describe(ctx: ExtensionContext | undefined): unknown {
  if (!ctx) return { bound: false };
  const entries = ctx.sessionManager.getEntries();
  const assistants = entries.filter(
    (entry) => entry.type === 'message' && record(entry.message)?.role === 'assistant',
  );
  const api: unknown = ctx.model?.api;
  const registeredModel = ctx.model
    ? ctx.modelRegistry.find(ctx.model.provider, ctx.model.id)
    : undefined;
  return {
    sessionId: ctx.sessionManager.getSessionId(),
    sessionFile: fileName(ctx.sessionManager.getSessionFile()),
    provider: ctx.model?.provider,
    model: ctx.model?.id,
    api: typeof api === 'string' ? api : undefined,
    usingOAuth: registeredModel ? ctx.modelRegistry.isUsingOAuth(registeredModel) : undefined,
    contextUsage: ctx.getContextUsage(),
    entries: entries.length,
    assistantMessages: assistants.length,
    totals: readTotals(entries),
  };
}

/** Metadata and counters only: never include prompts, responses, or credentials. */
export function diagnosticReport(options: {
  command: ExtensionContext;
  bound: ExtensionContext | undefined;
  cached: Snapshot | undefined;
  /** The extension's own module address (`import.meta.url`). */
  source: string;
  quotaEvents?: { received: number; parsed: number; accepted: number };
  quotaProvider?: ReturnType<ProviderQuotaService['diagnostics']>;
  headerEvents?: ReturnType<OpenAIHeaderQuota['diagnostics']>;
  footerSlots?: string[];
  gitMonitor?: ReturnType<GitMonitor['stats']> | undefined;
}): string {
  return withoutPersonalPaths(
    JSON.stringify(
      {
        diagnosticVersion: 3,
        capabilities: {
          footer: 'configurable-slots-v1',
          quotaSources: [
            ...quotaSources.map((source) => source.provider),
            'openai-response-headers',
          ],
        },
        runsFrom: runsFrom(options.source),
        quotaEvents: options.quotaEvents,
        quotaProvider: options.quotaProvider,
        headerEvents: options.headerEvents,
        footerSlots: options.footerSlots,
        gitMonitor: options.gitMonitor,
        commandContext: describe(options.command),
        footerContext: describe(options.bound),
        cachedFooter: options.cached && {
          git: options.cached.git,
          tokens: options.cached.tokens,
          capacity: options.cached.capacity,
          percent: options.cached.percent,
          totals: options.cached.totals,
          apiCostEstimate: options.cached.apiCostEstimate,
          rateLimits: options.cached.rateLimits,
          quotaStatus: options.cached.quotaStatus,
          outputTokensPerSecond: options.cached.outputTokensPerSecond,
        },
      },
      null,
      2,
    ),
  );
}
