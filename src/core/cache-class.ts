import type { CacheUsage } from './cache-usage.js';

/**
 * What the last response's cache counters tell us:
 * `pending` no response yet; `reported` the provider served part of the prompt from its cache;
 * `none` it reported counters earlier in this session and none this time (a real miss, usually
 * because the cache expired or the prompt changed); `unreported` it never reported any reads in
 * this session, so a zero may only mean the counter is not sent.
 */
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

/** Whether an API sends cache-write counts at all. */
export type WriteSupport = 'reports' | 'sometimes' | 'never' | 'unknown';

const REPORTS = new Set(['anthropic-messages', 'bedrock-converse-stream']);
/** Counted only by some of the services behind these APIs (OpenRouter does, OpenAI and DeepSeek do not). */
const SOMETIMES = new Set([
  'openai-completions',
  'openai-responses',
  'openai-codex-responses',
  'azure-openai-responses',
]);

/** From Pi's API id; an id not listed is `never`, the safe side (no write is claimed or implied). */
export function writeSupport(api: string | undefined): WriteSupport {
  if (api === undefined) return 'unknown';
  if (REPORTS.has(api)) return 'reports';
  return SOMETIMES.has(api) ? 'sometimes' : 'never';
}
