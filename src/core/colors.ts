import { record } from './validation.js';

export const COLOR_TONES = [
  'accent',
  'text',
  'muted',
  'highlight',
  'warning',
  'error',
  'success',
] as const;
export type ColorTone = (typeof COLOR_TONES)[number];
export type ColorSettings = Partial<Record<ColorTone, string>>;

const HEX = /^#[0-9a-fA-F]{6}$/;
export const isHexColor = (value: unknown): boolean => typeof value === 'string' && HEX.test(value);

const WORDS: Record<ColorTone, readonly string[]> = {
  accent: ['lavender', 'theme'],
  text: ['theme', 'terminal'],
  muted: ['theme', 'terminal'],
  highlight: ['theme', 'warning'],
  warning: ['theme'],
  error: ['theme'],
  success: ['theme'],
};
export const isColorTone = (value: string): value is ColorTone =>
  (COLOR_TONES as readonly string[]).includes(value);

export const colorWords = (tone: ColorTone): readonly string[] => WORDS[tone];

function colorValue(tone: ColorTone, value: unknown): string {
  if (typeof value === 'string' && (HEX.test(value) || WORDS[tone].includes(value))) return value;
  throw new Error(`${tone} colour must be ${WORDS[tone].join(', ')} or #rrggbb`);
}

export function parseColors(value: unknown): ColorSettings {
  const result: ColorSettings = {};
  for (const [key, item] of Object.entries(record(value))) {
    if (!isColorTone(key)) throw new Error(`Unknown colour: ${key.slice(0, 32)}`);
    result[key] = colorValue(key, item);
  }
  return result;
}

export function effectiveColors(
  settings: { colors?: ColorSettings },
  meterColor?: 'lavender' | 'theme',
): ColorSettings {
  return meterColor === 'theme' ? { accent: 'theme', ...settings.colors } : (settings.colors ?? {});
}

export const withoutTone = (colors: ColorSettings, tone: ColorTone): ColorSettings =>
  Object.fromEntries(Object.entries(colors).filter(([key]) => key !== tone));

export function withColor(colors: ColorSettings, tone: ColorTone, value: string): ColorSettings {
  const rest = withoutTone(colors, tone);
  const stored = value === 'default' || value === WORDS[tone][0] ? undefined : value;
  if (stored === undefined) return rest;
  return { ...rest, [tone]: colorValue(tone, stored) };
}
