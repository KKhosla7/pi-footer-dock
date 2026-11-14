import {
  COLOR_TONES,
  colorWords,
  effectiveColors,
  isColorTone,
  isHexColor,
  withColor,
} from './colors.js';
import type { ColorTone } from './colors.js';
import type { MenuRow } from './menu-row.js';
import { textRow } from './settings-labels.js';
import { withoutSetting } from './settings.js';
import type { Settings } from './settings.js';

export type IconKind = 'nerd' | 'portable';
const PREFIX = 'color:';
export const BOLD_ROW = 'iconBold';

export function offered(tone: ColorTone, current: string): string[] {
  const [, ...others] = colorWords(tone);
  return ['default', ...others, ...(current.startsWith('#') ? [current] : [])];
}

export const colorTone = (id: string): ColorTone | undefined => {
  const tone = id.slice(PREFIX.length);
  return id.startsWith(PREFIX) && isColorTone(tone) ? tone : undefined;
};

export function colorRows(settings: Settings, icons: IconKind): MenuRow[] {
  const colors = effectiveColors(settings, settings.slots.quota?.meterColor);
  return [
    ...COLOR_TONES.map((tone) => {
      const current = colors[tone] ?? 'default';
      return textRow(`${PREFIX}${tone}`, current, offered(tone, current));
    }),
    ...(icons === 'portable'
      ? [textRow(BOLD_ROW, settings.iconBold === false ? 'off' : 'on', ['on', 'off'])]
      : []),
  ];
}

export const isColorRow = (id: string): boolean => id === BOLD_ROW || colorTone(id) !== undefined;

function boldChoice(settings: Settings, value: string): Settings {
  const rest = withoutSetting(settings, 'iconBold');
  return value === 'off' ? { ...rest, iconBold: false } : value === 'on' ? rest : settings;
}

export function colorChoice(settings: Settings, id: string, value: string): Settings {
  if (id === BOLD_ROW) return boldChoice(settings, value);
  const tone = colorTone(id);
  if (!tone) return settings;
  const legacy = settings.slots.quota?.meterColor;
  const current = effectiveColors(settings, legacy)[tone] ?? 'default';
  if (!isHexColor(value) && !offered(tone, current).includes(value)) return settings;
  const rest = withoutSetting(settings, 'colors');
  const colors = withColor({ ...effectiveColors(settings, legacy) }, tone, value);
  const withAccent =
    tone === 'accent' && legacy === 'theme' && value === 'default'
      ? { ...colors, accent: 'lavender' }
      : colors;
  return Object.keys(withAccent).length > 0 ? { ...rest, colors: withAccent } : rest;
}
