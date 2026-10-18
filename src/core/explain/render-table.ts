import type { Block } from './blocks.js';
import { INDENT, fit, pad, padLeft, plain, width } from './style.js';
import type { Ctx } from './style.js';

const GAP = '  ';
const MIN_COLUMN = 4;

/** Column widths: as wide as the longest cell, the widest column giving way when the room is short. */
function columnWidths(
  rows: readonly (readonly string[])[],
  columns: number,
  room: number,
): number[] {
  const widths = Array.from({ length: columns }, (_, column) =>
    Math.max(MIN_COLUMN, ...rows.map((row) => width(row[column] ?? ''))),
  );
  const excess =
    widths.reduce((acc, value) => acc + value, 0) - (room - GAP.length * (columns - 1));
  if (excess > 0) {
    const widest = widths.indexOf(Math.max(...widths));
    widths[widest] = Math.max(MIN_COLUMN, (widths[widest] ?? 0) - excess);
  }
  return widths;
}

export function tableLines(block: Extract<Block, { kind: 'table' }>, ctx: Ctx): string[] {
  const rows = [block.head, ...block.rows].map((row) => row.map(plain));
  const widths = columnWidths(rows, block.head.length, ctx.width - INDENT.length);
  const draw = (row: readonly string[], header: boolean): string => {
    const cells = widths.map((size, column) => {
      const text = fit(row[column] ?? '', size);
      const aligned = block.right?.includes(column) ? padLeft(text, size) : pad(text, size);
      return header ? ctx.style.bold(ctx.style.fg('muted', aligned)) : aligned;
    });
    return fit(INDENT + cells.join(GAP), ctx.width);
  };
  return rows.map((row, index) => draw(row, index === 0));
}
