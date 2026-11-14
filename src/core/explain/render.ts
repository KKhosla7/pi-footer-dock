import type { Block } from './blocks.js';
import { barLines, meterLines, stackLines } from './render-bars.js';
import { tableLines } from './render-table.js';
import { bulletLines, factLines, headingLines, noteLines } from './render-text.js';
import { ASCII, UNICODE, fit } from './style.js';
import type { Ctx, Style } from './style.js';

export type { Style } from './style.js';
export { plain } from './style.js';

type Drawers = { [K in Block['kind']]: (block: Extract<Block, { kind: K }>, ctx: Ctx) => string[] };
const drawers: Drawers = {
  heading: headingLines,
  facts: factLines,
  meters: meterLines,
  stack: stackLines,
  bars: barLines,
  table: tableLines,
  bullets: bulletLines,
  note: noteLines,
  gap: () => [''],
};

const DATA = new Set<Block['kind']>(['table', 'bars', 'stack', 'facts', 'meters']);
const PROSE = new Set<Block['kind']>(['note', 'bullets']);

export function renderBlocks(
  blocks: readonly Block[],
  style: Style,
  width: number,
  ascii = false,
): string[] {
  const ctx: Ctx = { style, cells: ascii ? ASCII : UNICODE, width: Math.max(10, width) };
  return blocks
    .flatMap((block, index) => {
      const lines = (drawers[block.kind] as (b: Block, c: Ctx) => string[])(block, ctx);
      const next = blocks[index + 1];
      const needsAir = (following: Block): boolean =>
        block.kind === 'stack'
          ? following.kind !== 'gap'
          : DATA.has(block.kind) && PROSE.has(following.kind);
      const air = lines.length > 0 && next !== undefined && needsAir(next);
      return air ? [...lines, ''] : lines;
    })
    .map((line) => fit(line, ctx.width));
}
