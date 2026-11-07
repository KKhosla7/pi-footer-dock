import type { RateLimitWindow } from '../core/rate-limits.js';
import type { ObserveWindow, WindowType } from '../core/window-report.js';
import type { ProviderQuotaSource } from './contract.js';
import { record, windowOf } from './shared/window.js';
import type { RecordLike } from './shared/window.js';

const goKeys = [
  ['rolling', '5h'],
  ['weekly', 'week'],
  ['monthly', 'month'],
] as const;
/** One window: `entry` is what the reply holds under its key, if anything. */
function goWindow(
  label: WindowType,
  entry: RecordLike | undefined,
  observe?: ObserveWindow,
): RateLimitWindow | undefined {
  if (!entry) {
    observe?.({ type: label, sent: false, kept: false });
    return undefined;
  }
  const parsed = windowOf(label, entry.percent, entry.resetsAt, observe);
  const status = entry.status;
  const blocking =
    typeof status === 'string' && status !== 'ok' && /^[a-z][a-z-]{0,23}$/u.test(status);
  return parsed && blocking ? { ...parsed, badge: status } : parsed;
}
/** `GET /zen/go/v1/usage`: `usage.{rolling,weekly,monthly}` of `{status, percent, resetsAt}`. */
export function parseOpenCodeGoUsage(
  body: unknown,
  observe?: ObserveWindow,
): RateLimitWindow[] | undefined {
  const usage = record(record(body)?.usage);
  if (!usage) return undefined;
  const windows = goKeys
    .map(([key, label]) => goWindow(label, record(usage[key]), observe))
    .filter((window): window is RateLimitWindow => window !== undefined);
  return windows.length > 0 ? windows : undefined;
}

export const openCodeGo: ProviderQuotaSource = {
  provider: 'opencode-go',
  label: 'OpenCode Go',
  origin: 'https://opencode.ai',
  path: '/zen/go/v1/usage',
  parse: parseOpenCodeGoUsage,
};
