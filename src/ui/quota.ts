import { visibleWidth } from '@earendil-works/pi-tui';
import type { Snapshot } from '../core/model.js';
import { formatPercent, safeLabel } from '../core/model.js';
import { formatReset } from '../core/rate-limits.js';
import type { RateLimitWindow } from '../core/rate-limits.js';
import { quotaSuffix } from '../core/quota-freshness.js';
import type { SlotOptions } from '../core/footer-config.js';
import type { Paint } from './palette.js';
import { layerOn } from '../core/layers.js';
import { lookIndex } from '../core/looks.js';
import { METER_CELLS } from '../core/meter-styles.js';
import type { MeterStyle } from '../core/meter-styles.js';
import type { Look } from '../core/looks.js';
import type { RenderOptions } from './render-options.js';
import { paintIcon } from './segment-parts.js';

interface Settings {
  icon: string;
  budget: number;
  slot: SlotOptions;
}

export function quotaMeter(
  percent: number,
  options: RenderOptions,
  style: MeterStyle = 'slanted',
): string {
  const bounded = Math.min(100, Math.max(0, percent));
  const filled = bounded > 0 ? Math.max(1, Math.round((bounded / 100) * 7)) : 0;
  const tone = percent <= 25 ? 'warning' : 'accent';
  return Array.from({ length: 7 }, (_, index) =>
    options.paint(
      index < filled ? METER_CELLS[style].on : METER_CELLS[style].off,
      index < filled ? tone : 'muted',
      index < filled && options.quotaFrame === index ? 'bold' : undefined,
    ),
  ).join('');
}

const SEPARATOR = '   │   ';
const SLIM_SEPARATOR = ' │ ';
const TIERS = 5;

function windowText(
  window: RateLimitWindow,
  tier: number,
  options: RenderOptions,
  slot: SlotOptions,
): string {
  const p = options.paint;
  const blocked = window.badge !== undefined;
  const level = Math.min(4, tier);
  const tone = blocked ? 'error' : window.remainingPercent <= 25 ? 'warning' : 'text';
  const reset = formatReset(window.resetAt, options.now);
  const shown = slot.wording === 'used' ? 100 - window.remainingPercent : window.remainingPercent;
  return (
    p(`${safeLabel(window.label)} `, 'muted') +
    (level <= 1 && layerOn(slot, 'meter')
      ? quotaMeter(shown, options, slot.meterStyle) + p(' ')
      : '') +
    p(formatPercent(shown), tone, 'bold') +
    (level <= 2 && layerOn(slot, 'reset')
      ? p(' ') + paintIcon(p, options.glyphs.reset) + p(` ${reset}`, 'muted')
      : '')
  );
}
const separatorAt = (tier: number): string => (tier === 0 ? SEPARATOR : SLIM_SEPARATOR);

interface Entry {
  blocked: boolean;
  text: string;
}
function keepThatFit(entries: Entry[], fits: (texts: string[]) => boolean): string[] {
  const keep = new Set<number>();
  const priority = entries
    .map((_, index) => index)
    .sort((a, b) => Number(entries[b]?.blocked) - Number(entries[a]?.blocked));
  for (const index of priority) {
    const chosen = [...keep, index].sort((a, b) => a - b);
    if (fits(chosen.map((i) => entries[i]?.text ?? ''))) keep.add(index);
  }
  return entries.filter((_, index) => keep.has(index)).map((entry) => entry.text);
}

function liveWindows(snapshot: Snapshot, options: RenderOptions): RateLimitWindow[] {
  const now = (options.now ?? Date.now()) / 1000;
  return (snapshot.rateLimits?.windows ?? []).filter((window) => window.resetAt > now);
}
function prepare(snapshot: Snapshot, options: RenderOptions, settings: { icon: string }) {
  return {
    prefix: settings.icon ? `${settings.icon}  ` : '',
    suffix: quotaSuffix(snapshot),
    live: liveWindows(snapshot, options),
  };
}
function compose(
  p: Paint,
  parts: { prefix: string; suffix: string },
  shape: { texts: string[]; tier: number },
): string {
  const separator = p(separatorAt(shape.tier), 'muted');
  return p(parts.prefix, 'icon') + shape.texts.join(separator) + p(parts.suffix, 'muted');
}

const COLLAPSES_AT = lookIndex('sm');
const collapsedView = (windows: RateLimitWindow[], slot: SlotOptions): RateLimitWindow[] =>
  slot.collapsedShow
    ? windows.filter((window) => slot.collapsedShow?.includes(window.label))
    : windows.slice(0, -1);
const collapsible = (look: Look, windows: RateLimitWindow[], slot: SlotOptions): boolean =>
  windows.length > 1 &&
  (slot.collapse === 'always' || lookIndex(look) >= COLLAPSES_AT) &&
  collapsedView(windows, slot).length < windows.length;

export function quotaForLook(
  snapshot: Snapshot,
  options: RenderOptions,
  settings: { icon: string; slot: SlotOptions },
  look: Look,
): string {
  const parts = prepare(snapshot, options, settings);
  if (parts.live.length === 0)
    return options.paint(snapshot.quotaStatus ?? 'quota unavailable', 'muted');
  const collapsed = collapsible(look, parts.live, settings.slot) && !options.quotaExpanded;
  const tier = Math.max(0, lookIndex(look) - (collapsed ? 1 : 0));
  const shown = collapsed ? collapsedView(parts.live, settings.slot) : parts.live;
  if (shown.length === 0) return '';
  const texts = shown.map((window) => windowText(window, tier, options, settings.slot));
  return compose(options.paint, parts, { texts, tier });
}

export function quotaToggle(
  snapshot: Snapshot,
  options: RenderOptions,
  look: Look,
  slot: SlotOptions,
): string {
  if (!collapsible(look, liveWindows(snapshot, options), slot)) return '';
  const glyph = options.quotaExpanded ? options.glyphs.collapse : options.glyphs.expand;
  return options.paint(` ${glyph} `, 'icon', 'bold');
}

export function renderQuota(
  snapshot: Snapshot,
  options: RenderOptions,
  settings: Settings,
): string {
  const parts = prepare(snapshot, options, settings);
  const fits = (texts: string[], tier: number) =>
    texts.length > 0 &&
    visibleWidth(parts.prefix + texts.join(separatorAt(tier)) + parts.suffix) <= settings.budget;
  for (let tier = 0; tier < TIERS; tier += 1) {
    const texts = parts.live.map((window) => windowText(window, tier, options, settings.slot));
    if (fits(texts, tier)) return compose(options.paint, parts, { texts, tier });
  }
  const last = TIERS - 1;
  const texts = keepThatFit(
    parts.live.map((window) => ({
      blocked: window.badge !== undefined,
      text: windowText(window, last, options, settings.slot),
    })),
    (kept) => fits(kept, last),
  );
  return texts.length > 0
    ? compose(options.paint, parts, { texts, tier: last })
    : options.paint(snapshot.quotaStatus ?? 'quota unavailable', 'muted');
}
