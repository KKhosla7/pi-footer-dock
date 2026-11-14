import { colorToOklch, colorToRgb, oklchColor, parseColor, rgbColor } from '@earendil-works/pi-tui';
import type { Color } from '@earendil-works/pi-tui';
import type { Theme } from '@earendil-works/pi-coding-agent';
import { isHexColor } from '../core/colors.js';
import type { ColorSettings, ColorTone } from '../core/colors.js';

export type Tone = ColorTone | 'icon';
export type Paint = (text: string, tone?: Tone, emphasis?: 'bold' | 'underline') => string;

type ThemePaint = Pick<Theme, 'fg' | 'bold' | 'underline'> &
  Partial<Pick<Theme, 'style' | 'colors' | 'appearance'>>;

const token = {
  muted: 'dim',
  text: 'text',
  highlight: 'text',
  warning: 'warning',
  error: 'error',
  success: 'success',
  accent: 'accent',
} as const;

export interface PaintSettings {
  colors: ColorSettings;
  iconBold: boolean;
}
const NOTHING: PaintSettings = { colors: {}, iconBold: false };
export interface Background {
  r: number;
  g: number;
  b: number;
}

const LAVENDER = colorToOklch(parseColor('#b4a0e5'));
const FIXED = { dark: parseColor('#b4a0e5'), light: parseColor('#7459b4') } as const;
export const ICON_CONTRAST = 3;
export const FLOOR: Record<ColorTone, number> = {
  text: 4.5,
  highlight: 4.5,
  muted: 3,
  warning: 3,
  error: 3,
  success: 3,
  accent: ICON_CONTRAST,
};
const GUESS = { dark: 0, light: 1 } as const;
const MIDDLE = 0.179;

const channel = (value: number): number => {
  const unit = value / 255;
  return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
};
export const luminanceOf = ({ r, g, b }: Background): number =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
export function contrast(first: Color, background: number): number {
  const a = luminanceOf(colorToRgb(first));
  const [high, low] = a > background ? [a, background] : [background, a];
  return (high + 0.05) / (low + 0.05);
}

export function readable(color: Color, background: number, floor: number): Color {
  if (contrast(color, background) >= floor) return color;
  const { l, c, h } = colorToOklch(color);
  const step = background > MIDDLE ? -0.02 : 0.02;
  let lightness = l;
  let result = color;
  for (let tries = 0; tries < 60 && contrast(result, background) < floor; tries += 1) {
    lightness = Math.min(1, Math.max(0, lightness + step));
    result = oklchColor(lightness, c, h);
  }
  if (contrast(result, background) >= floor) return result;
  const black = rgbColor(0, 0, 0);
  const white = rgbColor(255, 255, 255);
  return contrast(black, background) >= contrast(white, background) ? black : white;
}

export function adaptedAccent(
  accent: Color | undefined,
  appearance: 'dark' | 'light',
  background: number = GUESS[appearance],
): Color {
  const start =
    accent === undefined || (accent.kind === 'indexed' && accent.index < 16)
      ? FIXED[appearance]
      : oklchColor(colorToOklch(accent).l, LAVENDER.c, LAVENDER.h);
  return readable(start, background, ICON_CONTRAST);
}

const hexColors = new Map<string, Color>();
function hexColor(value: string): Color {
  let color = hexColors.get(value);
  if (!color) {
    color = parseColor(value);
    hexColors.set(value, color);
  }
  return color;
}

function withColor(theme: ThemePaint, color: Color, text: string): string {
  if (theme.style) return theme.style(text, { fg: color });
  const { r, g, b } = colorToRgb(color);
  return `\u001b[38;2;${r};${g};${b}m${text}\u001b[39m`;
}
const terminalColor = (role: ColorTone, text: string): string =>
  role === 'muted' ? `\u001b[2m${text}\u001b[22m` : `\u001b[39m${text}\u001b[39m`;

export function createPaint(
  theme: ThemePaint,
  settings: () => PaintSettings = () => NOTHING,
  terminal: () => Background | undefined = () => undefined,
): Paint {
  let table: unknown;
  let seen: Background | undefined;
  const memo = new Map<string, Color | null>();
  const backgroundLuminance = (): number =>
    seen ? luminanceOf(seen) : GUESS[theme.appearance ?? 'dark'];
  const worked = (key: string, work: () => Color | null): Color | null => {
    const known = terminal();
    if (table !== theme.colors || seen !== known) {
      table = theme.colors;
      seen = known;
      memo.clear();
    }
    let value = memo.get(key);
    if (value === undefined) {
      value = work();
      memo.set(key, value);
    }
    return value;
  };
  const moved = (name: ColorTone, role: ColorTone): Color | null =>
    worked(`${name}:${role}`, () => {
      const own = theme.colors?.[token[name]];
      if (own === undefined || (own.kind === 'indexed' && own.index < 16)) return null;
      const result = readable(own, backgroundLuminance(), FLOOR[role]);
      return result === own ? null : result;
    });
  const lavender = (): Color =>
    worked('lavender', () =>
      adaptedAccent(theme.colors?.accent, theme.appearance ?? 'dark', backgroundLuminance()),
    ) ?? FIXED.dark;
  const draw = (text: string, role: ColorTone, choice: string | undefined): string => {
    if (choice !== undefined && isHexColor(choice)) return withColor(theme, hexColor(choice), text);
    if (choice === 'terminal') return terminalColor(role, text);
    if (role === 'accent' && choice !== 'theme') return withColor(theme, lavender(), text);
    const name: ColorTone = choice === 'warning' ? 'warning' : role;
    const shifted = moved(name, role);
    return shifted ? withColor(theme, shifted, text) : theme.fg(token[name], text);
  };
  return (text, tone = 'text', emphasis) => {
    const { colors, iconBold } = settings();
    const role: ColorTone = tone === 'icon' ? 'accent' : tone;
    const colored = draw(text, role, colors[role]);
    const bold = emphasis === 'bold' || (tone === 'icon' && iconBold);
    if (bold) return theme.bold(colored);
    if (emphasis === 'underline') return theme.underline(colored);
    return colored;
  };
}
