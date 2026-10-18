import { QUOTA_MAX_WINDOWS } from '../core/quota-limits.js';
import type { RateLimitWindow } from '../core/rate-limits.js';
import type { ProviderQuotaSource } from './contract.js';
import { record, windowOf } from './shared/window.js';

const clineTypes = new Map([
  ['five_hour', '5h'],
  ['weekly', 'week'],
  ['monthly', 'month'],
]);
function clineWindow(item: unknown): RateLimitWindow | undefined {
  const entry = record(item);
  const label = typeof entry?.type === 'string' ? clineTypes.get(entry.type) : undefined;
  return label ? windowOf(label, entry?.percentUsed, entry?.resetsAt) : undefined;
}
/** `GET /api/v1/users/me/plan/usage-limits`: `data.limits[]` of `{type, percentUsed, resetsAt}`. */
export function parseClinePassLimits(body: unknown): RateLimitWindow[] | undefined {
  const limits = record(record(body)?.data)?.limits;
  if (!Array.isArray(limits)) return undefined;
  const windows = new Map<string, RateLimitWindow>();
  for (const item of limits.slice(0, 16)) {
    const parsed = clineWindow(item);
    if (parsed && !windows.has(parsed.label)) windows.set(parsed.label, parsed);
  }
  return windows.size > 0 ? [...windows.values()].slice(0, QUOTA_MAX_WINDOWS) : undefined;
}

export const clinePass: ProviderQuotaSource = {
  provider: 'clinepass',
  label: 'ClinePass',
  origin: 'https://api.cline.bot',
  path: '/api/v1/users/me/plan/usage-limits',
  parse: parseClinePassLimits,
};
