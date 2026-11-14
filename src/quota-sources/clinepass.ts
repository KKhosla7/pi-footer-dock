import { QUOTA_MAX_WINDOWS } from '../core/quota-limits.js';
import type { RateLimitWindow } from '../core/rate-limits.js';
import type { ObserveWindow, WindowType } from '../core/window-report.js';
import type { ProviderQuotaSource } from './contract.js';
import { record, windowOf } from './shared/window.js';

const clineTypes = new Map<string, WindowType>([
  ['five_hour', '5h'],
  ['weekly', 'week'],
  ['monthly', 'month'],
]);
function clineWindow(item: unknown, observe?: ObserveWindow): RateLimitWindow | undefined {
  const entry = record(item);
  const label = typeof entry?.type === 'string' ? clineTypes.get(entry.type) : undefined;
  if (!label) {
    observe?.({ type: 'unrecognized', sent: true, kept: false });
    return undefined;
  }
  return windowOf(label, entry?.percentUsed, entry?.resetsAt, observe);
}
export function parseClinePassLimits(
  body: unknown,
  observe?: ObserveWindow,
): RateLimitWindow[] | undefined {
  const limits = record(record(body)?.data)?.limits;
  if (!Array.isArray(limits)) return undefined;
  const windows = new Map<string, RateLimitWindow>();
  for (const item of limits.slice(0, 16)) {
    const parsed = clineWindow(item, observe);
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
