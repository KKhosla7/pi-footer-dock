import type { RateLimitWindow } from '../core/rate-limits.js';
import type { ProviderQuotaSource } from './contract.js';
import { record, windowOf } from './shared/window.js';

const goKeys = [
  ['rolling', '5h'],
  ['weekly', 'week'],
  ['monthly', 'month'],
] as const;
/** `GET /zen/go/v1/usage`: `usage.{rolling,weekly,monthly}` of `{status, percent, resetsAt}`. */
export function parseOpenCodeGoUsage(body: unknown): RateLimitWindow[] | undefined {
  const usage = record(record(body)?.usage);
  if (!usage) return undefined;
  const windows: RateLimitWindow[] = [];
  for (const [key, label] of goKeys) {
    const entry = record(usage[key]);
    const parsed = windowOf(label, entry?.percent, entry?.resetsAt);
    if (!parsed) continue;
    const status = entry?.status;
    const blocking =
      typeof status === 'string' && status !== 'ok' && /^[a-z][a-z-]{0,23}$/u.test(status);
    windows.push(blocking ? { ...parsed, badge: status } : parsed);
  }
  return windows.length > 0 ? windows : undefined;
}

export const openCodeGo: ProviderQuotaSource = {
  provider: 'opencode-go',
  label: 'OpenCode Go',
  origin: 'https://opencode.ai',
  path: '/zen/go/v1/usage',
  parse: parseOpenCodeGoUsage,
};
