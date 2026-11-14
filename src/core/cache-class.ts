import type { CacheUsage } from './cache-usage.js';

export type CacheKind = 'pending' | 'reported' | 'none' | 'unreported';

export function cacheKind(
  cache: CacheUsage | null | undefined,
  sessionRead: number | null | undefined,
): CacheKind {
  if (!cache) return 'pending';
  if (cache.read === null) return 'unreported';
  if (cache.read > 0) return 'reported';
  return typeof sessionRead === 'number' && sessionRead > 0 ? 'none' : 'unreported';
}

export type WriteSupport = 'reports' | 'sometimes' | 'never' | 'unknown';

const REPORTS = new Set(['anthropic-messages', 'bedrock-converse-stream']);
const SOMETIMES = new Set([
  'openai-completions',
  'openai-responses',
  'openai-codex-responses',
  'azure-openai-responses',
]);

export function writeSupport(api: string | undefined): WriteSupport {
  if (api === undefined) return 'unknown';
  if (REPORTS.has(api)) return 'reports';
  return SOMETIMES.has(api) ? 'sometimes' : 'never';
}
