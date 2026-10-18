import { homedir } from 'node:os';
import { NAMES } from '../core/product.js';
import { sessionUsage } from '../core/usage-ledger.js';
import type { SessionUsage } from '../core/usage-ledger.js';
import { SettingsManager } from '@earendil-works/pi-coding-agent';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
import type { GitState, Snapshot, TokenTotals } from '../core/model.js';
import type { RateLimits } from '../core/rate-limits.js';
import { parseStoredRateLimits } from '../core/rate-limits.js';

export function readTotals(
  entries: ReturnType<ExtensionContext['sessionManager']['getEntries']>,
): TokenTotals {
  return sessionUsage(entries).totals;
}

export function restoreRateLimits(
  ctx: Pick<ExtensionContext, 'model' | 'sessionManager'>,
): RateLimits | null {
  // OpenAI/Codex auth can change between logins; never restore another account's limits.
  const model = ctx.model;
  if (!model || ['openai-codex', 'openai'].includes(model.provider)) return null;
  const entries = ctx.sessionManager.getBranch();
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry?.type !== 'custom') continue;
    if (
      entry.customType !== NAMES.limitsEntry &&
      !(NAMES.legacyLimitsEntries as readonly string[]).includes(entry.customType)
    )
      continue;
    const restored = parseStoredRateLimits(entry.data);
    if (restored?.provider === model.provider && model.id === restored.model) return restored;
  }
  return null;
}

function validNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}

function capacityOf(value: number | null | undefined): number | null {
  const capacity = validNumber(value);
  return capacity === 0 ? null : capacity;
}

function percentage(tokens: number | null, capacity: number | null): number | null {
  return tokens === null || capacity === null ? null : (tokens / capacity) * 100;
}

function remaining(tokens: number | null, capacity: number | null, reserve: number): number | null {
  return tokens === null || capacity === null ? null : Math.max(0, capacity - reserve - tokens);
}

/** Pi compacts when tokens > capacity - reserve; a reserve of the whole window or more means from 0%. */
function compactionPoint(capacity: number | null, reserve: number): number | null {
  return capacity === null ? null : Math.floor((Math.max(0, capacity - reserve) * 100) / capacity);
}

export type SnapshotSource = Pick<
  ExtensionContext,
  'cwd' | 'model' | 'thinkingLevel' | 'getContextUsage'
> & {
  sessionManager: Pick<ExtensionContext['sessionManager'], 'getEntries'>;
};

function modelLabels(model: SnapshotSource['model']): Pick<Snapshot, 'provider' | 'model' | 'api'> {
  return {
    provider: model?.provider ?? 'unknown provider',
    model: model?.id ?? 'no model',
    ...(typeof model?.api === 'string' ? { api: model.api } : {}),
  };
}

function missingQuotaStatus(
  provider: string | undefined,
  limits: RateLimits | null,
): string | null {
  if (limits || provider === 'openai-codex') return null;
  return provider === 'openai' ? 'account quota unavailable' : 'quota unsupported';
}

export function readSnapshot(
  ctx: SnapshotSource,
  pi: Pick<ExtensionAPI, 'getSettings'>,
  git: GitState,
  input: RateLimits | { limits: RateLimits | null; usage: SessionUsage } | null = null,
): Snapshot {
  const state =
    input && 'usage' in input
      ? input
      : { limits: input, usage: sessionUsage(ctx.sessionManager.getEntries()) };
  const usage = ctx.getContextUsage();
  const capacity = capacityOf(usage?.contextWindow) ?? capacityOf(ctx.model?.contextWindow);
  const tokens = validNumber(usage?.tokens);
  const settings = SettingsManager.inMemory(pi.getSettings()).getCompactionSettings(ctx.model);
  const compactRemaining = remaining(tokens, capacity, settings.reserveTokens);
  return {
    cwd: ctx.cwd,
    home: homedir(),
    git,
    tokens,
    capacity,
    percent: percentage(tokens, capacity),
    compactRemaining,
    compactAt: compactionPoint(capacity, settings.reserveTokens),
    compactReserve: settings.reserveTokens,
    autoCompact: settings.enabled,
    ...state.usage,
    ...modelLabels(ctx.model),
    thinking: ctx.thinkingLevel ?? null,
    rateLimits: state.limits,
    quotaStatus: missingQuotaStatus(ctx.model?.provider, state.limits),
  };
}
