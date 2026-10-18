import { stripTerminalSequences } from '@earendil-works/pi-tui';
import { quotaForLook, quotaToggle } from './quota.js';
import { formatResponseRate } from '../core/response-speed.js';
import { cacheKind } from '../core/cache-class.js';
import { formatCacheReuse, formatCacheSummary } from '../core/cache-presentation.js';
import { costDisplay } from '../core/history/costs.js';
import type { Snapshot } from '../core/model.js';
import { formatApiCost, formatPercent, formatTokens, safeLabel } from '../core/model.js';
import { renderExtensionItem } from './ext-segment.js';
import { ICON_ACTION_IDS } from '../core/click-targets.js';
import { QUOTA_TOGGLE, slotOptions } from '../core/footer-config.js';
import { stockForms, variantAt } from '../core/looks.js';
import type { Look, Variant } from '../core/looks.js';
import type { FooterConfig, SlotOptions } from '../core/footer-config.js';
import type { Glyphs } from './glyphs.js';
import type { RenderOptions } from './render-options.js';
import {
  compaction,
  gitBranch,
  gitValue,
  iconSpan,
  paintIcon,
  usage,
  workspace,
} from './segment-parts.js';

export interface Segment {
  id: string;
  text: string;
  gap: number;
  /** Columns of the leading icon token (glyph and its space); 0 when the icon is not a click target of its own. */
  iconWidth: number;
}
interface Rendering {
  icon: string;
  slot: SlotOptions;
  look: Look;
  variant: Variant;
}
type StockFormatter = (snapshot: Snapshot, options: RenderOptions, rendering: Rendering) => string;
const gaps = new Map([
  ['context', 0],
  ['context-usage', 0],
  ['branch', 3],
  ['changes', 3],
  ['ahead', 3],
  ['thinking', 2],
  ['compaction', 2],
  ['input', 5],
  ['output', 3],
  ['cache', 3],
  ['speed', 3],
  ['cost', 3],
  [QUOTA_TOGGLE, 0],
]);
const iconKeys = new Map<string, keyof Glyphs>([
  ['workspace', 'folder'],
  ['branch', 'branch'],
  ['changes', 'changed'],
  ['ahead', 'ahead'],
  ['model', 'robot'],
  ['thinking', 'reasoning'],
  ['context', 'chip'],
  ['input', 'input'],
  ['output', 'output'],
  ['cache', 'cache'],
  ['speed', 'speed'],
]);
/** Construct dispatch/closures once, not once per slot per frame. */
const stockTexts = new Map<string, StockFormatter>([
  ['workspace', (s, { paint: p }, r) => workspace(s, p, r)],
  ['branch', (s, { paint: p }, { icon }) => gitBranch(s, p, icon)],
  [
    'changes',
    (s, { paint: p }, { icon, variant }) =>
      gitValue(s.git.changed, p, { icon, kind: 'files', short: variant !== 'full' }),
  ],
  [
    'ahead',
    (s, { paint: p }, { icon, variant }) =>
      gitValue(s.git.ahead, p, { icon, kind: 'ahead', short: variant !== 'full' }),
  ],
  [
    'model',
    (s, { paint: p }, { icon, variant }) =>
      paintIcon(p, `${icon} `) +
      (variant === 'full' ? p(`${safeLabel(s.provider)}/`, 'muted') : '') +
      p(safeLabel(s.model), 'cyan', 'bold'),
  ],
  [
    'thinking',
    (s, { paint: p }, { icon }) =>
      s.thinking ? paintIcon(p, `${icon} `) + p(safeLabel(s.thinking), 'muted') : '',
  ],
  ['context', (_s, { paint: p }, { icon }) => paintIcon(p, `${icon} `)],
  ['context-usage', (s, { paint: p }, { variant }) => usage(s, p, variant)],
  ['compaction', (s, { paint: p }, { slot }) => p(compaction(s, slot.unit), 'yellow')],
  [
    'input',
    (s, { paint: p }, { icon }) => paintIcon(p, `${icon} `) + p(formatTokens(s.totals.input)),
  ],
  [
    'output',
    (s, { paint: p }, { icon }) => paintIcon(p, `${icon} `) + p(formatTokens(s.totals.output)),
  ],
  [
    'cache',
    (s, { paint: p }, { icon, variant }) =>
      paintIcon(p, `${icon} `) +
      p(
        formatCacheSummary(
          s.cacheUsage,
          variant === 'short',
          cacheKind(s.cacheUsage, s.totals.cacheRead),
        ),
      ),
  ],
  [
    'speed',
    (s, { paint: p }, { icon }) =>
      typeof s.outputTokensPerSecond === 'number' &&
      s.outputTokensPerSecond > 0 &&
      Number.isFinite(s.outputTokensPerSecond)
        ? paintIcon(p, `${icon} `) +
          p(`${formatResponseRate(s.outputTokensPerSecond)} tok/s`, 'muted')
        : '',
  ],
  ['quota', (s, o, r) => quotaForLook(s, o, r, r.look)],
  [QUOTA_TOGGLE, (s, o, r) => quotaToggle(s, o, r.look, r.slot)],
  [
    'cost',
    // Nothing to say without an amount: an "n/a" would only take room from values that exist.
    (s, { paint: p }, { slot }) => {
      const text = costDisplay(s, slot.period);
      return text === '' ? '' : p(text);
    },
  ],
]);
const templateValues = new Map<string, (s: Snapshot, icon: string) => string>([
  ['icon', (_s, icon) => icon],
  ['provider', (s) => safeLabel(s.provider)],
  ['model', (s) => safeLabel(s.model)],
  ['thinking', (s) => safeLabel(s.thinking ?? '—')],
  ['changes', (s) => (s.git.changed === null ? '—' : `${s.git.changed}`)],
  ['ahead', (s) => (s.git.ahead === null ? '—' : `${s.git.ahead}`)],
  ['capacity', (s) => formatTokens(s.capacity)],
  ['percent', (s) => formatPercent(s.percent)],
  ['input', (s) => formatTokens(s.totals.input)],
  ['output', (s) => formatTokens(s.totals.output)],
  ['cache', (s) => formatTokens(s.totals.cacheRead)],
  ['cacheread', (s) => formatTokens(s.cacheUsage?.read ?? null)],
  ['cachewrite', (s) => formatTokens(s.cacheUsage?.write ?? null)],
  ['cacheinput', (s) => formatTokens(s.cacheUsage?.input ?? null)],
  ['cachereuse', (s) => formatCacheReuse(s.cacheUsage?.reusePercent)],
  ['cost', (s) => formatApiCost(s.apiCostEstimate)],
  ['speed', (s) => formatResponseRate(s.outputTokensPerSecond)],
]);
function template(text: string, snapshot: Snapshot, icon: string): string {
  return text.replace(
    /\{([a-z]+)\}/gu,
    (match, key: string) => templateValues.get(key)?.(snapshot, icon) ?? match,
  );
}
export function segmentGap(config: FooterConfig, id: string): number {
  return slotOptions(config, id).gap ?? gaps.get(id) ?? 3;
}
/** The chevron belongs to the quota, so it follows the quota's hiding and collapsing. */
function ownSlot(config: FooterConfig, id: string): SlotOptions {
  const own = slotOptions(config, id);
  if (id !== QUOTA_TOGGLE) return own;
  const { hideAt, collapse, collapsedShow } = slotOptions(config, 'quota');
  return {
    ...own,
    ...(hideAt ? { hideAt } : {}),
    ...(collapse ? { collapse } : {}),
    ...(collapsedShow ? { collapsedShow } : {}),
  };
}

/** One item as footer text: a registered extension's item, or one of Footer Dock's own. */
export function renderSegment(
  id: string,
  snapshot: Snapshot,
  options: RenderOptions,
  settings: { config: FooterConfig; look: Look },
): Segment {
  const external = options.extensions?.find(id);
  if (!external) return renderStock(id, snapshot, options, settings);
  const shown = renderExtensionItem(external.item, settings.look, options);
  return { id, ...shown, gap: segmentGap(settings.config, id) };
}

function renderStock(
  id: string,
  snapshot: Snapshot,
  options: RenderOptions,
  settings: { config: FooterConfig; look: Look },
): Segment {
  const slot = ownSlot(settings.config, id);
  const key = iconKeys.get(id);
  const icon = slot.icon ?? (key ? options.glyphs[key] : '');
  const variant = variantAt(stockForms.get(id), settings.look, slot.hideAt);
  const text =
    variant === 'hide'
      ? ''
      : slot.text === undefined
        ? (stockTexts.get(id)?.(snapshot, options, {
            icon,
            slot,
            look: settings.look,
            variant,
          }) ?? '')
        : slot.text
            .split('{icon}')
            .map((part) => options.paint(template(part, snapshot, icon)))
            .join(paintIcon(options.paint, icon));
  // The icon is a token of its own only when the item really starts with it (not "Git unavailable").
  const hasIcon = text && slot.text === undefined && stripTerminalSequences(text).startsWith(icon);
  const iconWidth = hasIcon && ICON_ACTION_IDS.has(id) ? iconSpan(id, icon) : 0;
  return { id, text, gap: segmentGap(settings.config, id), iconWidth };
}
