import type { Block, MeterRow } from './blocks.js';
import { INDENT, MAX_LABEL, blank, fit, pad, plain, width, wrapStyled } from './style.js';
import { ASCII } from './style.js';
import type { Ctx } from './style.js';

type Of<K extends Block['kind']> = Extract<Block, { kind: K }>;
const MAX_BAR = 28;
const MAX_STACK = 40;
const MIN_BAR = 6;
const clamp = (value: number): number => Math.max(0, Math.min(1, value));

function meterBar(row: MeterRow, size: number, { style, cells }: Ctx): string {
  const tone = row.tone ?? 'accent';
  if (row.fraction === null) return style.fg('dim', cells.empty.repeat(size));
  const filled = Math.round(clamp(row.fraction) * size);
  const mark = row.mark === undefined ? -1 : Math.min(size - 1, Math.floor(clamp(row.mark) * size));
  return Array.from({ length: size }, (_, index) => {
    if (index === mark) return style.fg('accent', cells.mark);
    return index < filled ? style.fg(tone, cells.full) : style.fg('dim', cells.empty);
  }).join('');
}

export function meterLines(block: Of<'meters'>, ctx: Ctx): string[] {
  const { rows } = block;
  const labelWidth = Math.min(
    MAX_LABEL,
    Math.max(0, ...rows.map((row) => width(plain(row.label)))),
  );
  const textWidth = Math.max(0, ...rows.map((row) => width(plain(row.text))));
  const size = Math.max(
    0,
    Math.min(MAX_BAR, ctx.width - (INDENT.length + labelWidth + 4 + textWidth)),
  );
  // A blank row between meters, so each reads on its own line.
  return rows.flatMap((row, index) => {
    const label = ctx.style.fg('muted', pad(fit(plain(row.label), labelWidth), labelWidth));
    const text = row.tone ? ctx.style.fg(row.tone, plain(row.text)) : plain(row.text);
    const bar = size >= MIN_BAR ? `${meterBar(row, size, ctx)}  ` : '';
    const line = fit(`${INDENT}${label}  ${bar}${text}`, ctx.width);
    return index === 0 ? [line] : ['', line];
  });
}

/** Cell counts that add up to `total`, in proportion to `amounts` (largest remainder). */
export function shares(amounts: readonly number[], total: number): number[] {
  const sum = amounts.reduce((acc, amount) => acc + Math.max(0, amount), 0);
  if (sum <= 0 || total <= 0) return amounts.map(() => 0);
  const exact = amounts.map((amount) => (Math.max(0, amount) / sum) * total);
  const cells = exact.map(Math.floor);
  const byRest = exact
    .map((value, index) => ({ index, rest: value - Math.floor(value) }))
    .sort((a, b) => b.rest - a.rest);
  const left = total - cells.reduce((acc, cell) => acc + cell, 0);
  for (let at = 0; at < left; at += 1) {
    const index = byRest[at % byRest.length]?.index ?? 0;
    cells[index] = (cells[index] ?? 0) + 1;
  }
  return cells;
}

export function stackLines(block: Of<'stack'>, { style, cells, width: room }: Ctx): string[] {
  // A part keeps its own pattern whatever the others are, so `read` always looks the same.
  const live = block.parts
    .map((part, position) => ({
      part,
      glyph: cells.parts[position % cells.parts.length] ?? cells.full,
    }))
    .filter(({ part }) => part.amount > 0);
  if (live.length === 0) return [];
  const size = Math.max(MIN_BAR, Math.min(MAX_STACK, room - 2 * INDENT.length));
  const counts = shares(
    live.map(({ part }) => part.amount),
    size,
  );
  const bar = live
    .map(({ part, glyph }, index) => style.fg(part.tone, glyph.repeat(counts[index] ?? 0)))
    .join('');
  const total = live.reduce((acc, { part }) => acc + part.amount, 0);
  const legend = live
    .map(({ part, glyph }) => {
      const share = Math.round((part.amount / total) * 100);
      const extra = part.text ? ` ${plain(part.text)}` : '';
      return `${style.fg(part.tone, glyph)} ${plain(part.label)}${extra} ${style.fg('dim', `${share}%`)}`;
    })
    .join('   ');
  return [INDENT + bar, ...wrapStyled(legend, room - INDENT.length, INDENT, blank(INDENT.length))];
}

const LEVELS = '▁▂▃▄▅▆▇█';
const HEIGHT = 3;

/** One row of the chart, top row first: how many eighths of a cell each column fills in it. */
function eighths(value: number, peak: number, row: number): number {
  const total = peak > 0 ? Math.round((Math.max(0, value) / peak) * HEIGHT * 8) : 0;
  return Math.max(0, Math.min(8, total - (HEIGHT - 1 - row) * 8));
}
const glyph = (fill: number, ascii: boolean, levels: string): string => {
  if (fill === 0) return ' ';
  if (!ascii) return levels.charAt(fill - 1);
  return fill >= 6 ? '#' : fill >= 3 ? ':' : '.';
};

export function barLines(block: Of<'bars'>, { style, cells, width: room }: Ctx): string[] {
  const { values, axis, peak, current, tone } = block.chart;
  if (values.length === 0) return [];
  const ascii = cells === ASCII;
  const wide = values.length * 2 + 2 <= room;
  const top = Math.max(0, ...values);
  const lines = Array.from({ length: HEIGHT }, (_, row) =>
    values
      .map((value, index) => {
        const cell = glyph(eighths(value, top, row), ascii, LEVELS);
        const paint = index === current ? 'accent' : (tone ?? 'muted');
        return style.fg(paint, cell) + (wide ? ' ' : '');
      })
      .join(''),
  );
  const span = values.length * (wide ? 2 : 1);
  const gap = Math.max(1, span - axis[0].length - axis[1].length);
  const rule = `${axis[0]}${' '.repeat(gap)}${axis[1]}`;
  return [
    ...lines.map(
      (line, row) =>
        INDENT + line + (row === 0 ? `  ${style.fg('dim', `peak ${plain(peak)}`)}` : ''),
    ),
    INDENT + style.fg('dim', plain(rule)),
  ];
}
