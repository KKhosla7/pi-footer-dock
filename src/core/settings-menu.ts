import { LOOKS, isLook } from './looks.js';
import { METER_STYLES, isMeterStyle } from './meter-styles.js';
import { HIDDEN, SHOWN, row, savable, withNote } from './menu-row.js';
import type { MenuRow } from './menu-row.js';
import { settingsItems, withSlot, withoutSetting } from './settings.js';
import {
  collapsedChoice,
  collapsedLabel,
  collapsedRows,
  isCollapsedRow,
  windowChoice,
  windowRows,
} from './settings-collapse.js';
import { colorChoice, colorRows, isColorRow } from './settings-colors.js';
import type { IconKind } from './settings-colors.js';
import { itemText, textRow } from './settings-labels.js';
import {
  isKnownLayerRow,
  isLayerRow,
  layerChoice,
  layerRows,
  layerValues,
} from './settings-layers.js';
import { COST_PERIODS, DEFAULT_COST_PERIOD } from './history/costs.js';
import type { CostPeriod } from './history/costs.js';
import type { Settings } from './settings.js';

export type { MenuRow };
const OPTIONS: Record<string, string[]> = {
  unit: ['tokens', 'percent'],
  period: [...COST_PERIODS],
  limits: ['off', 'on'],
  wording: ['left', 'used'],
  collapse: ['tight', 'always'],
  expanded: ['no', 'yes'],
  animation: ['on', 'off'],
  clicks: ['actions', 'explain'],
  glyphs: ['auto', 'nerd', 'portable'],
  meterStyle: [...METER_STYLES],
};
const isPeriod = (value: string): value is CostPeriod =>
  (COST_PERIODS as readonly string[]).includes(value);
const visibility = [SHOWN, ...LOOKS.slice(1), HIDDEN];

function visibilityOf(hideAt: string | undefined): string {
  if (hideAt === undefined) return SHOWN;
  return hideAt === LOOKS[0] ? HIDDEN : hideAt;
}
const options = (id: string): string[] => OPTIONS[id] ?? [];

function itemRows(settings: Settings): MenuRow[] {
  return settingsItems().map((id) =>
    withNote(
      row(
        `item:${id}`,
        itemText.get(id)?.label ?? id,
        visibilityOf(settings.slots[id]?.hideAt),
        visibility,
      ),
      itemText.get(id)?.note ?? '',
    ),
  );
}
const valued = (id: string, current: string | undefined): MenuRow =>
  textRow(id, current ?? options(id)[0] ?? '', options(id));
const defaultPeriod = (): MenuRow => ({
  ...valued('period', undefined),
  default: DEFAULT_COST_PERIOD,
});
function quotaRows(settings: Settings): MenuRow[] {
  const quota = settings.slots.quota ?? {};
  return [
    valued('wording', quota.wording),
    valued('collapse', quota.collapse === 'always' ? 'always' : 'tight'),
    valued('expanded', settings.quotaExpanded ? 'yes' : 'no'),
    valued('animation', quota.animation === false ? 'off' : 'on'),
    valued('meterStyle', quota.meterStyle),
  ];
}

export function menuRows(
  settings: Settings,
  published: readonly string[],
  icons: IconKind = settings.glyphs ?? 'nerd',
): MenuRow[] {
  return [
    ...itemRows(settings),
    valued('unit', settings.slots.compaction?.unit),
    { ...defaultPeriod(), current: settings.slots.cost?.period ?? DEFAULT_COST_PERIOD },
    ...windowRows(settings, published),
    valued('limits', settings.limits === 'on' ? 'on' : 'off'),
    ...quotaRows(settings),
    ...layerRows(settings),
    ...collapsedRows(settings, published),
    valued('clicks', settings.clicks === 'explain' ? 'explain' : 'actions'),
    ...colorRows(settings, icons),
    valued('glyphs', settings.glyphs ?? 'auto'),
  ];
}

function visibilityChoice(settings: Settings, id: string, value: string): Settings {
  const look = value === HIDDEN ? LOOKS[0] : value;
  return withSlot(settings, id, { hideAt: value !== SHOWN && isLook(look) ? look : undefined });
}

function allowed(id: string): string[] | undefined {
  if (id.startsWith('item:'))
    return settingsItems().includes(id.slice('item:'.length)) ? visibility : undefined;
  if (id.startsWith('window:'))
    return savable(id.slice('window:'.length)) ? [SHOWN, HIDDEN] : undefined;
  if (isCollapsedRow(id)) return savable(collapsedLabel(id)) ? [SHOWN, HIDDEN] : undefined;
  if (isLayerRow(id)) return isKnownLayerRow(id) ? layerValues() : undefined;
  return OPTIONS[id];
}

function globalChoice(settings: Settings, id: string, value: string): Settings {
  switch (id) {
    case 'clicks':
      return { ...settings, clicks: value === 'explain' ? 'explain' : 'actions' };
    case 'period':
      return withSlot(settings, 'cost', {
        period: value !== DEFAULT_COST_PERIOD && isPeriod(value) ? value : undefined,
      });
    case 'unit':
      return withSlot(settings, 'compaction', {
        unit: value === 'percent' ? 'percent' : undefined,
      });
    case 'expanded':
      return { ...settings, quotaExpanded: value === 'yes' };
    case 'glyphs':
      return value === 'auto'
        ? withoutSetting(settings, 'glyphs')
        : { ...settings, glyphs: value === 'portable' ? 'portable' : 'nerd' };
    default:
      return quotaChoice(settings, id, value);
  }
}
function withLimits(settings: Settings, value: string): Settings {
  const next = { ...settings };
  if (value === 'on') next.limits = 'on';
  else delete next.limits;
  return next;
}
function quotaChoice(settings: Settings, id: string, value: string): Settings {
  switch (id) {
    case 'limits':
      return withLimits(settings, value);
    case 'wording':
      return withSlot(settings, 'quota', { wording: value === 'used' ? 'used' : undefined });
    case 'collapse':
      return withSlot(settings, 'quota', { collapse: value === 'always' ? 'always' : undefined });
    case 'animation':
      return withSlot(settings, 'quota', { animation: value === 'off' ? false : undefined });
    case 'meterStyle':
      return withSlot(settings, 'quota', {
        meterStyle: isMeterStyle(value) && value !== 'slanted' ? value : undefined,
      });
    default:
      return settings;
  }
}

export function choose(
  settings: Settings,
  id: string,
  value: string,
  published: readonly string[] = [],
): Settings {
  if (isColorRow(id)) return colorChoice(settings, id, value);
  if (!allowed(id)?.includes(value)) return settings;
  if (id.startsWith('item:')) return visibilityChoice(settings, id.slice('item:'.length), value);
  if (id.startsWith('window:')) return windowChoice(settings, id.slice('window:'.length), value);
  if (isCollapsedRow(id)) return collapsedChoice(settings, collapsedLabel(id), value, published);
  if (isLayerRow(id)) return layerChoice(settings, id, value);
  return globalChoice(settings, id, value);
}
