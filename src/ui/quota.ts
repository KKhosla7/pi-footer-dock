import { visibleWidth } from '@earendil-works/pi-tui';
import type { Snapshot } from '../core/model.js';
import { formatPercent, safeLabel } from '../core/model.js';
import { formatReset } from '../core/rate-limits.js';
import type { RateLimitWindow } from '../core/rate-limits.js';
import { quotaSuffix } from '../core/quota-freshness.js';
import type { SlotOptions } from '../core/footer-config.js';
import type { Paint } from './palette.js';
import { lookIndex } from '../core/looks.js';
import type { Look } from '../core/looks.js';
import type { RenderOptions } from './render-options.js';

interface Settings {
  icon: string;
  budget: number;
  slot: SlotOptions;
}

/** Original slanted seven-cell meter; positive quota must never appear exhausted. */
export function quotaMeter(percent: number, options: RenderOptions, slot: SlotOptions): string {
  const bounded = Math.min(100, Math.max(0, percent));
  const filled = bounded > 0 ? Math.max(1, Math.round((bounded / 100) * 7)) : 0;
  const tone = percent <= 25 ? 'yellow' : slot.meterColor === 'theme' ? 'cyan' : 'lavender';
  return Array.from({ length: 7 }, (_, index) =>
    options.paint(
      index < filled ? '▰' : '▱',
      index < filled ? tone : 'muted',
      index < filled && options.quotaFrame === index ? 'bold' : undefined,
    ),
  ).join('');
}

const SEPARATOR = '   │   ';
const TIERS = 5;

/**
 * One window at a shrink tier. Tier 0 spells everything out; 1 keeps the reset icon and time;
 * 2 drops the reset; 3 drops the meter; 4 is the bare percentage. A window the provider reports
 * as blocking is distinguished by colour (red), not by extra width; its status word is in the
 * quota help.
 */
function windowText(
  window: RateLimitWindow,
  tier: number,
  options: RenderOptions,
  slot: SlotOptions,
): string {
  const p = options.paint;
  const blocked = window.badge !== undefined;
  const level = Math.min(4, tier);
  const tone = blocked ? 'red' : window.remainingPercent <= 25 ? 'yellow' : 'text';
  const reset = formatReset(window.resetAt, options.now);
  // "used" mirrors the number and the meter; the colour still follows what is left.
  const used = slot.wording === 'used';
  const shown = used ? 100 - window.remainingPercent : window.remainingPercent;
  return (
    p(`${safeLabel(window.label)} `, 'muted') +
    (level <= 2 ? quotaMeter(shown, options, slot) + p(' ') : '') +
    p(formatPercent(shown), tone, 'bold') +
    (level <= 3 ? p(used ? ' used' : ' left', 'muted') : '') +
    (level <= 1 ? p(' ') + p(options.glyphs.reset, 'cyan') : '') +
    (level === 0 ? p(` resets in ${reset}`, 'muted') : level === 1 ? p(` ${reset}`, 'muted') : '')
  );
}

interface Entry {
  blocked: boolean;
  text: string;
}
/** Windows that fit in the compact form: blocked first, then the rest, shown in natural order. */
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
function compose(p: Paint, parts: { prefix: string; suffix: string }, texts: string[]): string {
  return p(parts.prefix, 'cyan') + texts.join(p(SEPARATOR, 'muted')) + p(parts.suffix, 'muted');
}

/** From this look on the quota collapses (hides its last window) unless the user expanded it. */
const COLLAPSES_AT = lookIndex('sm');
/** What a collapsed quota shows: the user's pick, or every window but the last. */
const collapsedView = (windows: RateLimitWindow[], slot: SlotOptions): RateLimitWindow[] =>
  slot.collapsedShow
    ? windows.filter((window) => slot.collapsedShow?.includes(window.label))
    : windows.slice(0, -1);
const collapsible = (look: Look, windows: RateLimitWindow[], slot: SlotOptions): boolean =>
  windows.length > 1 &&
  (slot.collapse === 'always' || lookIndex(look) >= COLLAPSES_AT) &&
  collapsedView(windows, slot).length < windows.length;

/** The quota at one look of the footer (xl is the fullest, xs the most compact). */
export function quotaForLook(
  snapshot: Snapshot,
  options: RenderOptions,
  settings: { icon: string; slot: SlotOptions },
  look: Look,
): string {
  const parts = prepare(snapshot, options, settings);
  if (parts.live.length === 0)
    return options.paint(snapshot.quotaStatus ?? 'quota unavailable', 'muted');
  // Collapsed, the last window (the longest period) is left out and `›` brings it back.
  const collapsed = collapsible(look, parts.live, settings.slot) && !options.quotaExpanded;
  const tier = Math.max(0, lookIndex(look) - (collapsed ? 1 : 0));
  const shown = collapsed ? collapsedView(parts.live, settings.slot) : parts.live;
  if (shown.length === 0) return '';
  const texts = shown.map((window) => windowText(window, tier, options, settings.slot));
  return compose(options.paint, parts, texts);
}

/** The click target that expands or collapses the quota; empty where nothing is collapsed. */
export function quotaToggle(
  snapshot: Snapshot,
  options: RenderOptions,
  look: Look,
  slot: SlotOptions,
): string {
  if (!collapsible(look, liveWindows(snapshot, options), slot)) return '';
  const glyph = options.quotaExpanded ? options.glyphs.collapse : options.glyphs.expand;
  return options.paint(` ${glyph} `, 'cyan', 'bold');
}

/** Natural order is always 5h, week, month; the richest shape that fits the budget is used. */
export function renderQuota(
  snapshot: Snapshot,
  options: RenderOptions,
  settings: Settings,
): string {
  const parts = prepare(snapshot, options, settings);
  const fits = (texts: string[]) =>
    texts.length > 0 &&
    visibleWidth(parts.prefix + texts.join(SEPARATOR) + parts.suffix) <= settings.budget;
  const shapes = Array.from({ length: TIERS }, (_, tier) =>
    parts.live.map((window) => windowText(window, tier, options, settings.slot)),
  );
  const chosen = shapes.find(fits);
  if (chosen) return compose(options.paint, parts, chosen);
  const texts = keepThatFit(
    parts.live.map((window) => ({
      blocked: window.badge !== undefined,
      text: windowText(window, TIERS - 1, options, settings.slot),
    })),
    fits,
  );
  return texts.length > 0
    ? compose(options.paint, parts, texts)
    : options.paint(snapshot.quotaStatus ?? 'quota unavailable', 'muted');
}
