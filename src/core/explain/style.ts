import {
  stripTerminalSequences,
  truncateToWidth,
  visibleWidth,
  wrapTextWithAnsi,
} from '@earendil-works/pi-tui';
import type { Tone } from './blocks.js';

/** The part of Pi's theme the renderer uses, so it can be drawn and tested without a terminal. */
export interface Style {
  fg(tone: Tone, text: string): string;
  bold(text: string): string;
}
/** Characters for bars: block characters everywhere, plain ASCII when the glyph set is portable. */
export interface Cells {
  full: string;
  empty: string;
  mark: string;
  parts: readonly string[];
}
export const UNICODE: Cells = { full: '█', empty: '░', mark: '┃', parts: ['█', '▓', '▒', '░'] };
export const ASCII: Cells = { full: '#', empty: '-', mark: '|', parts: ['#', '=', '+', '-'] };

/** What every block renderer needs. */
export interface Ctx {
  style: Style;
  cells: Cells;
  width: number;
}
export const INDENT = ' ';
export const MAX_LABEL = 14;

/** Text from outside the extension: no terminal sequences, no control characters, one line. */
export function plain(text: string): string {
  return stripTerminalSequences(text).replace(/[\p{Cc}\p{Cf}]/gu, ' ');
}
export const width = (text: string): number => visibleWidth(text);
export const pad = (text: string, size: number): string =>
  text + ' '.repeat(Math.max(0, size - visibleWidth(text)));
export const padLeft = (text: string, size: number): string =>
  ' '.repeat(Math.max(0, size - visibleWidth(text))) + text;
export const fit = (text: string, size: number): string => truncateToWidth(text, Math.max(1, size));

/** Wraps already styled text; the first line starts with `lead`, the others with `hang`. */
export function wrapStyled(text: string, room: number, lead: string, hang: string): string[] {
  return text
    .split('\n')
    .flatMap((paragraph) => wrapTextWithAnsi(paragraph, Math.max(1, room)))
    .map((line, index) => (index === 0 ? lead : hang) + line);
}
export const blank = (size: number): string => ' '.repeat(size);
