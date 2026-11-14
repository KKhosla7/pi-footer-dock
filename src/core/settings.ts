import { QUOTA_TOGGLE, slotHelp } from './footer-config.js';
import type { FooterConfig } from './footer-config.js';
import { parseColors } from './colors.js';
import type { ColorSettings } from './colors.js';
import { checkLayers } from './layers.js';
import { layerNames } from './looks.js';
import { parseSlotOptions } from './slot-options.js';
import type { SlotOptions } from './slot-options.js';
import { parseOpenWith } from './open-folder.js';
import { parseShrink } from './shrink.js';
import { record } from './validation.js';

export interface Settings {
  version: 1;
  glyphs?: 'nerd' | 'portable';
  glyphHintShown?: boolean;
  quotaExpanded?: boolean;
  colors?: ColorSettings;
  iconBold?: boolean;
  clicks?: 'actions' | 'explain';
  openWith?: string[];
  limits?: 'on' | 'off';
  shrink?: string[];
  slots: Record<string, SlotOptions>;
}
export type SlotPatch = { [K in keyof SlotOptions]?: SlotOptions[K] | undefined };

const QUOTA_ONLY = [
  'wording',
  'collapse',
  'collapsedShow',
  'hideWindows',
  'animation',
  'meterColor',
  'meterStyle',
];
const ownOption = (id: string, key: string): boolean => {
  if (key === 'layers') return layerNames.has(id);
  if (id === 'quota') return QUOTA_ONLY.includes(key);
  return (id === 'compaction' && key === 'unit') || (id === 'cost' && key === 'period');
};
export const SETTING_KEYS = [
  'version',
  'glyphs',
  'glyphHintShown',
  'quotaExpanded',
  'colors',
  'iconBold',
  'clicks',
  'openWith',
  'limits',
  'shrink',
  'slots',
];

export const defaultSettings = (): Settings => ({ version: 1, slots: {} });
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
    checkLayers(id, options);
    result[id] = options;
  }
  return result;
}

export function parseSettings(value: unknown): Settings {
  const data = record(value);
  if (Object.keys(data).some((key) => !SETTING_KEYS.includes(key)))
    throw new Error('Unknown setting');
  if (data.version !== 1) throw new Error('Unsupported settings version');
  const result = defaultSettings();
  readChoices(data, result);
  if (data.colors !== undefined) result.colors = parseColors(data.colors);
  if (data.openWith !== undefined) result.openWith = parseOpenWith(data.openWith);
  if (data.shrink !== undefined) result.shrink = parseShrink(data.shrink);
  if (data.slots !== undefined) result.slots = slots(data.slots);
  return result;
}
function readFlags(data: Record<string, unknown>, result: Settings): void {
  for (const key of ['glyphHintShown', 'quotaExpanded', 'iconBold'] as const) {
    if (data[key] === undefined) continue;
    if (typeof data[key] !== 'boolean') throw new Error(`${key} must be true or false`);
    result[key] = data[key];
  }
}
function readChoices(data: Record<string, unknown>, result: Settings): void {
  if (data.glyphs !== undefined) {
    if (data.glyphs !== 'nerd' && data.glyphs !== 'portable')
      throw new Error('glyphs must be nerd or portable');
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

export function applySettings(config: FooterConfig, settings: Settings): FooterConfig {
  const merged = { ...config.slots };
  for (const [id, options] of Object.entries(settings.slots))
    merged[id] = { ...options, ...config.slots[id] };
  const shrink = config.shrink ?? settings.shrink;
  return { ...config, slots: merged, ...(shrink ? { shrink } : {}) };
}

export function withoutSetting(
  settings: Settings,
  key: 'colors' | 'iconBold' | 'glyphs',
): Settings {
  return Object.fromEntries(
    Object.entries(settings).filter(([name]) => name !== key),
  ) as unknown as Settings;
}

export function withSlot(settings: Settings, id: string, patch: SlotPatch): Settings {
  const options = Object.entries({ ...settings.slots[id], ...patch }).filter(
    ([, value]) => value !== undefined,
  );
  const others = Object.entries(settings.slots).filter(([key]) => key !== id);
  const changed: [string, SlotOptions][] =
    options.length > 0 ? [[id, Object.fromEntries(options)]] : [];
  return { ...settings, slots: Object.fromEntries([...others, ...changed]) };
}
