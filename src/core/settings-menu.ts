import { LOOKS, isLook } from './looks.js';
import { HIDDEN, SHOWN, row, savable, withNote } from './menu-row.js';
import type { MenuRow } from './menu-row.js';
import { settingsItems, withSlot } from './settings.js';
import {
  collapsedChoice,
  collapsedLabel,
  collapsedRows,
  isCollapsedRow,
} from './settings-collapse.js';
import { compactionText, costText, itemText, quotaText } from './settings-text.js';
import { COST_PERIODS, DEFAULT_COST_PERIOD } from './history/costs.js';
import type { CostPeriod } from './history/costs.js';
import type { Settings } from './settings.js';

export type { MenuRow };
/** shown, then hidden from a narrower look on, then hidden always (the richest look is the first). */
const choices: Record<string, string[]> = {
  unit: ['tokens', 'percent'],
  period: ['day', 'week', 'month', 'session'],
  wording: ['left', 'used'],
  collapse: ['when tight', 'always collapsed'],
  expanded: ['no', 'yes'],
  animation: ['on', 'off'],
  meter: ['lavender', 'theme'],
  glyphs: ['nerd', 'portable'],
  clicks: ['do things', 'explain only'],
  limits: ['on', 'off'],
};
const isPeriod = (value: string): value is CostPeriod =>
  (COST_PERIODS as readonly string[]).includes(value);
const visibility = [SHOWN, ...LOOKS.slice(1).map((look) => `hidden from ${look}`), HIDDEN];

function visibilityOf(hideAt: string | undefined): string {
  if (hideAt === undefined) return SHOWN;
  return hideAt === LOOKS[0] ? HIDDEN : `hidden from ${hideAt}`;
}

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
function windowRows(settings: Settings, published: readonly string[]): MenuRow[] {
  const hidden = settings.slots.quota?.hideWindows ?? [];
  return [...new Set([...published, ...hidden])]
    .filter(savable)
    .map((label) =>
      withNote(
        row(`window:${label}`, `Limit window: ${label}`, hidden.includes(label) ? HIDDEN : SHOWN, [
          SHOWN,
          HIDDEN,
        ]),
        quotaText.window(label),
      ),
    );
}
function limitsRow(settings: Settings): MenuRow {
  return withNote(
    row(
      'limits',
      'Ask providers for limits',
      settings.limits === 'off' ? 'off' : 'on',
      choices.limits ?? [],
    ),
    quotaText.network,
  );
}
function clicksRow(settings: Settings): MenuRow {
  const current = settings.clicks === 'explain' ? 'explain only' : 'do things';
  return withNote(
    row('clicks', 'Item clicks', current, choices.clicks ?? []),
    'The folder icon opens the folder.',
  );
}
function compactionRow(settings: Settings): MenuRow {
  const current = settings.slots.compaction?.unit ?? 'tokens';
  return withNote(row('unit', 'Compaction unit', current, choices.unit ?? []), compactionText);
}
function costRow(settings: Settings): MenuRow {
  const current = settings.slots.cost?.period ?? DEFAULT_COST_PERIOD;
  return {
    ...withNote(row('period', 'Cost period', current, choices.period ?? []), costText.period),
    default: DEFAULT_COST_PERIOD,
  };
}
function quotaRows(settings: Settings): MenuRow[] {
  const quota = settings.slots.quota ?? {};
  const pick = (id: keyof typeof choices) => choices[id] ?? [];
  return [
    withNote(
      row('wording', 'Limit wording', quota.wording ?? 'left', pick('wording')),
      quotaText.wording,
    ),
    withNote(
      row(
        'collapse',
        'Collapse',
        quota.collapse === 'always' ? 'always collapsed' : 'when tight',
        pick('collapse'),
      ),
      quotaText.collapse,
    ),
    withNote(
      row(
        'expanded',
        'Limits start expanded',
        settings.quotaExpanded ? 'yes' : 'no',
        pick('expanded'),
      ),
      quotaText.expanded,
    ),
    withNote(
      row(
        'animation',
        'Limit animation',
        quota.animation === false ? 'off' : 'on',
        pick('animation'),
      ),
      quotaText.animation,
    ),
    withNote(
      row('meter', 'Meter colour', quota.meterColor ?? 'lavender', pick('meter')),
      quotaText.meter,
    ),
  ];
}

/** Rows for the menu: every item, the quota's windows and options, then the icon set. */
export function menuRows(settings: Settings, published: readonly string[]): MenuRow[] {
  return [
    ...itemRows(settings),
    compactionRow(settings),
    costRow(settings),
    ...windowRows(settings, published),
    limitsRow(settings),
    ...quotaRows(settings),
    ...collapsedRows(settings, published),
    clicksRow(settings),
    withNote(
      row('glyphs', 'Icons', settings.glyphs ?? 'nerd', choices.glyphs ?? []),
      quotaText.glyphs,
    ),
  ];
}

function windowChoice(settings: Settings, label: string, value: string): Settings {
  const others = (settings.slots.quota?.hideWindows ?? []).filter((item) => item !== label);
  const next = value === HIDDEN ? [...others, label] : others;
  return next.length > 8
    ? settings
    : withSlot(settings, 'quota', { hideWindows: next.length ? next : undefined });
}
function visibilityChoice(settings: Settings, id: string, value: string): Settings {
  const look = value === HIDDEN ? LOOKS[0] : value.replace('hidden from ', '');
  return withSlot(settings, id, { hideAt: value !== SHOWN && isLook(look) ? look : undefined });
}

function allowed(id: string): string[] | undefined {
  if (id.startsWith('item:'))
    return settingsItems().includes(id.slice('item:'.length)) ? visibility : undefined;
  if (id.startsWith('window:'))
    return savable(id.slice('window:'.length)) ? [SHOWN, HIDDEN] : undefined;
  if (isCollapsedRow(id)) return savable(collapsedLabel(id)) ? [SHOWN, HIDDEN] : undefined;
  return choices[id];
}

function globalChoice(settings: Settings, id: string, value: string): Settings {
  switch (id) {
    case 'clicks':
      return { ...settings, clicks: value === 'explain only' ? 'explain' : 'actions' };
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
      return { ...settings, glyphs: value === 'portable' ? 'portable' : 'nerd' };
    default:
      return quotaChoice(settings, id, value);
  }
}
/** The provider-limits switch: stored only when it is off, so the default leaves the file alone. */
function withLimits(settings: Settings, value: string): Settings {
  const next = { ...settings };
  if (value === 'off') next.limits = 'off';
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
      return withSlot(settings, 'quota', {
        collapse: value === 'always collapsed' ? 'always' : undefined,
      });
    case 'animation':
      return withSlot(settings, 'quota', { animation: value === 'off' ? false : undefined });
    default:
      return withSlot(settings, 'quota', { meterColor: value === 'theme' ? 'theme' : undefined });
  }
}

/** The settings after the user picked `value` in row `id`; unknown rows or values change nothing. */
export function choose(
  settings: Settings,
  id: string,
  value: string,
  published: readonly string[] = [],
): Settings {
  if (!allowed(id)?.includes(value)) return settings;
  if (id.startsWith('item:')) return visibilityChoice(settings, id.slice('item:'.length), value);
  if (id.startsWith('window:')) return windowChoice(settings, id.slice('window:'.length), value);
  if (isCollapsedRow(id)) return collapsedChoice(settings, collapsedLabel(id), value, published);
  return globalChoice(settings, id, value);
}
