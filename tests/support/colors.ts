import type { PaintSettings } from '../../src/ui/palette.js';

export const taggingTheme = () => ({
  fg: (color: string, text: string) => `<${color}>${text}</>`,
  bold: (text: string) => `<b>${text}</b>`,
  underline: (text: string) => text,
});
const CODES: Record<string, string> = {
  dim: '90',
  text: '37',
  warning: '33',
  error: '31',
  success: '32',
  accent: '36',
};
export const ansiTheme = () => ({
  fg: (color: string, text: string) => `\u001b[${CODES[color] ?? '39'}m${text}\u001b[39m`,
  bold: (text: string) => `\u001b[1m${text}\u001b[22m`,
  underline: (text: string) => text,
});
const ESC = String.fromCharCode(27);
const SPAN = new RegExp(`${ESC}\\[((?:38;2;\\d+;\\d+;\\d+)|\\d+)m([^${ESC}]*)`, 'gu');
export const spansOf = (line: string): { code: string; text: string }[] =>
  [...line.matchAll(SPAN)]
    .filter((match) => !['1', '22', '39'].includes(match[1] ?? ''))
    .map((match) => ({ code: match[1] ?? '', text: match[2] ?? '' }));
export const settingsOf =
  (colors: PaintSettings['colors'] = {}, iconBold = false) =>
  (): PaintSettings => ({
    colors,
    iconBold,
  });
export const NOW = 4_000_000_000_000;
