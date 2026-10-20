import { QUOTA_TOGGLE, slotHelp } from './footer-config.js';
import type { FooterConfig } from './footer-config.js';
import { parseSlotOptions } from './slot-options.js';
import type { SlotOptions } from './slot-options.js';
import { parseOpenWith } from './open-folder.js';
import { record } from './validation.js';

/** Preferences that hold across sessions; the session configuration still wins per option. */
export interface Settings {
  version: 1;
  glyphs?: 'nerd' | 'portable';
  /** The one-time note about icons that are not drawn has been shown. */
  glyphHintShown?: boolean;
  quotaExpanded?: boolean;
  /** `explain` keeps the old click on items (an explanation); the default acts (opens, picks). */
  clicks?: 'actions' | 'explain';
  /** The user's own app for opening the project folder, as a command with `{path}`. */
  openWith?: string[];
  /** `on` asks the provider's own usage service for its limits (about every 30 s, shared by all Pi windows); the default is off and sends nothing. */
  limits?: 'on' | 'off';
  slots: Record<string, SlotOptions>;
}
/** `undefined` clears an option. */
export type SlotPatch = { [K in keyof SlotOptions]?: SlotOptions[K] | undefined };

const QUOTA_ONLY = [
  'wording',
  'collapse',
  'collapsedShow',
  'hideWindows',
  'animation',
  'meterColor',
];
/** Options that only one item has: the quota's own, the compaction unit, the cost period. */
const ownOption = (id: string, key: string): boolean => {
  if (id === 'quota') return QUOTA_ONLY.includes(key);
  return (id === 'compaction' && key === 'unit') || (id === 'cost' && key === 'period');
};
const KEYS = [
  'version',
  'glyphs',
  'glyphHintShown',
  'quotaExpanded',
  'clicks',
  'openWith',
  'limits',
  'slots',
];

export const defaultSettings = (): Settings => ({ version: 1, slots: {} });
/** Items that can be configured: every stock item except the chevron, which follows the quota. */
export const settingsItems = (): string[] =>
  [...slotHelp.keys()].filter((id) => id !== QUOTA_TOGGLE);

function slots(value: unknown): Settings['slots'] {
  const result: Settings['slots'] = {};
  const known = new Set(settingsItems());
  for (const [id, item] of Object.entries(record(value))) {
    if (!known.has(id)) throw new Error(`Unknown item: ${id.slice(0, 32)}`);
    const options = parseSlotOptions(item);
    const misplaced = Object.keys(options).filter((key) => key !== 'hideAt' && !ownOption(id, key));
    if (misplaced.length > 0) throw new Error(`Option not available for ${id}: ${misplaced[0]}`);
    result[id] = options;
  }
  return result;
}

export function parseSettings(value: unknown): Settings {
  const data = record(value);
  if (Object.keys(data).some((key) => !KEYS.includes(key))) throw new Error('Unknown setting');
  if (data.version !== 1) throw new Error('Unsupported settings version');
  const result = defaultSettings();
  readChoices(data, result);
  if (data.openWith !== undefined) result.openWith = parseOpenWith(data.openWith);
  if (data.slots !== undefined) result.slots = slots(data.slots);
  return result;
}
/** The settings that are on or off. */
function readFlags(data: Record<string, unknown>, result: Settings): void {
  for (const key of ['glyphHintShown', 'quotaExpanded'] as const) {
    if (data[key] === undefined) continue;
    if (typeof data[key] !== 'boolean') throw new Error(`${key} must be boolean`);
    result[key] = data[key];
  }
}
/** The settings that are one of a few fixed values. */
function readChoices(data: Record<string, unknown>, result: Settings): void {
  if (data.glyphs !== undefined) {
    if (data.glyphs !== 'nerd' && data.glyphs !== 'portable') throw new Error('Invalid glyph set');
    result.glyphs = data.glyphs;
  }
  readFlags(data, result);
  if (data.limits !== undefined) {
    if (data.limits !== 'on' && data.limits !== 'off') throw new Error('limits must be on or off');
    result.limits = data.limits;
  }
  if (data.clicks !== undefined) {
    if (data.clicks !== 'actions' && data.clicks !== 'explain')
      throw new Error('clicks must be actions or explain');
    result.clicks = data.clicks;
  }
}

/** Defaults < settings < session: an option the session sets itself is never overridden. */
export function applySettings(config: FooterConfig, settings: Settings): FooterConfig {
  const merged = { ...config.slots };
  for (const [id, options] of Object.entries(settings.slots))
    merged[id] = { ...options, ...config.slots[id] };
  return { ...config, slots: merged };
}

/** A copy of the settings with one item's options changed; an item left without options is dropped. */
export function withSlot(settings: Settings, id: string, patch: SlotPatch): Settings {
  const options = Object.entries({ ...settings.slots[id], ...patch }).filter(
    ([, value]) => value !== undefined,
  );
  const others = Object.entries(settings.slots).filter(([key]) => key !== id);
  const changed: [string, SlotOptions][] =
    options.length > 0 ? [[id, Object.fromEntries(options)]] : [];
  return { ...settings, slots: Object.fromEntries([...others, ...changed]) };
}
