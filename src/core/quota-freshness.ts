import type { Snapshot } from './model.js';

function observationAge(snapshot: Snapshot): string | null {
  const freshness = snapshot.quotaFreshness;
  if (!freshness) return null;
  const seconds = Math.floor(
    (freshness.ageMs + Math.max(0, performance.now() - freshness.receivedMono)) / 1000,
  );
  return seconds < 60 ? `${seconds}s old` : `${Math.floor(seconds / 60)}m old`;
}
export function quotaSuffix(snapshot: Snapshot): string {
  return snapshot.quotaStatus === 'quota stale' ? ' (stale)' : '';
}
/** Server-published windows (every provider in `quota-sources`): what is shown, how fresh, what blocks. */
function providerHelp(label: string, snapshot: Snapshot, age: string | null): string {
  const blocked = (snapshot.rateLimits?.windows ?? [])
    .filter((window) => window.badge !== undefined)
    .map((window) => `${window.label} (${window.badge})`);
  return (
    `${label} reports these windows itself; each shows the share left (100 minus used) and when it resets. ` +
    (age ? `Latest observation: ${age}. ` : 'No observation is currently displayed. ') +
    'Windows the provider does not report are hidden. At most one request every 30 seconds per account, shared by all Pi windows; values older than five minutes are not shown. ' +
    (blocked.length > 0 ? `Blocked by the provider: ${blocked.join(', ')}. ` : '') +
    'These endpoints are not documented as stable; a changed response hides the windows rather than guessing.'
  );
}
/** `label` names the server-published source for this provider, when there is one. */
export function quotaHelp(snapshot: Snapshot, label?: string): string {
  const age = observationAge(snapshot);
  if (label) return providerHelp(label, snapshot, age);
  return (
    'Reported request/model-scoped API buckets, not numerical subscription usage. ' +
    (age
      ? `Latest observation: ${age}. `
      : snapshot.rateLimits
        ? 'Observation time unknown for restored snapshot. '
        : 'No reported bucket currently displayed. ') +
    'Values are snapshots, not realtime consumption. ' +
    (snapshot.provider === 'openai' ? 'Native OpenAI account quota is unavailable.' : '')
  );
}
