import { parseSlotOptions } from './slot-options.js';
import type { SlotOptions } from './slot-options.js';
import { identifier, record } from './validation.js';

export type { SlotOptions };

export interface FooterRow {
  left: string[];
  right: string[];
}
export interface FooterConfig {
  version: 1;
  rows: FooterRow[];
  slots: Record<string, SlotOptions>;
}

/** The quota's expand/collapse chevron. */
export const QUOTA_TOGGLE = 'quota-more';

export const slotHelp = new Map<string, string>([
  [
    'workspace',
    'Current working directory. Click its icon to open the folder in your file manager; /dock-open-with chooses another app.',
  ],
  [
    'branch',
    'Current Git branch. Git unavailable means observation or watch coverage is unavailable, not a clean zero; /dock-debug reports event-monitor health. No polling fallback.',
  ],
  [
    'changes',
    'Changed or untracked nonignored Git files, including nested untracked files. Staged and unstaged changes to one path count once; not changed lines. Filesystem notifications and Pi tool/lifecycle events trigger bounded Git reads automatically, including external edits; no periodic Git polling.',
  ],
  [
    'ahead',
    'Local commits ahead of the locally recorded Git upstream, reconciled automatically. Uncommitted files do not count. No upstream means unknown, not zero. No network fetches or live GitHub queries.',
  ],
  [
    'model',
    'Active provider and model. A provider name does not identify API-key versus OAuth authentication.',
  ],
  ['thinking', 'The active Pi thinking/reasoning level.'],
  [
    'context',
    'Invoke an advertised context action. Without an available action, show this explanation.',
  ],
  [
    'context-usage',
    'Current context utilization and model capacity, not cumulative session tokens. After compaction Pi may report unknown usage until the next response.',
  ],
  [
    'compaction',
    'Tokens remaining before the effective context limit minus the compaction reserve, or with the percent unit the point where Pi compacts as a share of the window (rounded down). Pi compacts when usage is above the window minus the reserve. This is not a time estimate.',
  ],
  [
    'input',
    'Cumulative provider-reported input tokens across session entries, not the current context size.',
  ],
  ['output', 'Cumulative provider-reported output tokens across session entries.'],
  [
    'cache',
    'Last = latest completed primary response, including a completed step in a running task; not live cache activity. Shows reported reuse and read/written token counts, omitting zero writes. Pending/unknown is not a miss; no reuse reported is not a confirmed miss. Actual expiry is unknown. Help retains full counters and cumulative reads.',
  ],
  [
    'speed',
    'Last completed primary response: reported output divided by SDK monotonic duration, including request/header wait. Not live token generation or pure decoding speed. Output may include reasoning. Cleared at turn start; absent for errors, invalid or sub-20ms timing.',
  ],
  [
    'quota',
    'Remaining limits from a verified source. API tokens/requests are OpenAI HTTP rate buckets from actual response headers, not ChatGPT five-hour or weekly subscription quota. Codex uses a separate authenticated usage endpoint. The openai OAuth flow targets api.openai.com; Codex results cannot establish its account quotas. No percentages are invented.',
  ],
  [
    QUOTA_TOGGLE,
    'Shows the other quota windows when the quota is collapsed to the one closest to running out (› expands, ‹ collapses). Keyboard: /dock-quota.',
  ],
  [
    'cost',
    "Estimated equivalent API spend, not subscription charges or allowance consumed. Prices come from Pi's model registry: the cost Pi recorded for each response, or its model's registry rate applied to the response's token categories. A response with no registry price (or a price of zero) is left out and the total is labelled partial.",
  ],
]);

export function defaultFooterConfig(): FooterConfig {
  return {
    version: 1,
    slots: {},
    rows: [
      { left: ['workspace', 'branch', 'changes', 'ahead'], right: ['model', 'thinking'] },
      {
        left: ['context', 'context-usage', 'compaction', 'input', 'output', 'cache', 'speed'],
        right: ['quota', QUOTA_TOGGLE, 'cost'],
      },
    ],
  };
}

function row(value: unknown): FooterRow {
  const data = record(value);
  const group = (items: unknown): string[] => {
    if (!Array.isArray(items) || items.length > 32 || !items.every(identifier))
      throw new Error('Rows require bounded slot-ID arrays');
    return items;
  };
  if (Object.keys(data).some((key) => key !== 'left' && key !== 'right'))
    throw new Error('Unknown row option');
  return { left: group(data.left), right: group(data.right) };
}

export function parseFooterConfig(value: unknown): FooterConfig {
  const data = record(value);
  if (Object.keys(data).some((key) => !['version', 'rows', 'slots'].includes(key)))
    throw new Error('Unknown config option');
  if (data.version !== undefined && data.version !== 1)
    throw new Error('Unsupported config version');
  const config = defaultFooterConfig();
  if (data.slots !== undefined) config.slots = readSlots(data.slots);
  if (data.rows !== undefined) config.rows = readRows(data.rows);
  checkSlots(config);
  return config;
}
function readSlots(value: unknown): FooterConfig['slots'] {
  const entries = Object.entries(record(value));
  if (entries.length > 32 || entries.some(([id]) => !identifier(id)))
    throw new Error('Invalid slot IDs/count');
  return Object.fromEntries(entries.map(([id, item]) => [id, parseSlotOptions(item)]));
}
function readRows(value: unknown): FooterConfig['rows'] {
  if (!Array.isArray(value) || value.length !== 2)
    throw new Error('Footer requires exactly two rows');
  return [row(value[0]), row(value[1])];
}
function checkSlots(config: FooterConfig): void {
  const ids = config.rows.flatMap((item) => [...item.left, ...item.right]);
  if (ids.length > 32 || new Set(ids).size !== ids.length)
    throw new Error('Slot IDs must be unique across the footer');
  for (const id of ids) {
    if (!slotHelp.has(id) && !config.slots[id]?.text)
      throw new Error(`Custom slot ${id} needs text`);
  }
}

export function slotOptions(config: FooterConfig, id: string): SlotOptions {
  return config.slots[id] ?? {};
}
export function clickMode(config: FooterConfig, id: string): NonNullable<SlotOptions['click']> {
  return slotOptions(config, id).click ?? (id === 'context' ? 'action' : 'help');
}
export function actionTargets(config: FooterConfig): Set<string> {
  return new Set(
    config.rows
      .flatMap((row) => [...row.left, ...row.right])
      .map((id) => slotOptions(config, id).actionTarget ?? id),
  );
}
