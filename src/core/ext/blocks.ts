import type { Block } from '../explain/blocks.js';
import { cleanText, fields, fraction, list, num, oneOf, paragraph } from './clean.js';
import { LIMITS } from './protocol.js';

export type Problems = string[];
const BLOCK_TONES = ['accent', 'success', 'warning', 'error', 'muted', 'dim'] as const;
type BlockToneName = (typeof BLOCK_TONES)[number];
const blockTone = (value: unknown) => oneOf<BlockToneName>(BLOCK_TONES, value);
const withTone = <T extends object>(
  base: T,
  tone: BlockToneName | undefined,
): T & { tone?: BlockToneName } => (tone ? { ...base, tone } : base);

function parseFacts(raw: Record<string, unknown>): Block | undefined {
  const rows = list(raw.rows, LIMITS.listItems).flatMap((entry) => {
    const row = fields(entry);
    const label = cleanText(row.label, LIMITS.label);
    const value = cleanText(row.value, LIMITS.formText);
    if (!label || !value) return [];
    const note = cleanText(row.note, LIMITS.note);
    return [withTone({ label, value, ...(note ? { note } : {}) }, blockTone(row.tone))];
  });
  return rows.length > 0 ? { kind: 'facts', rows } : undefined;
}
function parseMeters(raw: Record<string, unknown>): Block | undefined {
  const rows = list(raw.rows, LIMITS.listItems).flatMap((entry) => {
    const row = fields(entry);
    const label = cleanText(row.label, LIMITS.label);
    const text = cleanText(row.text, LIMITS.formText);
    if (!label || !text) return [];
    const mark = fraction(row.mark);
    return [
      withTone(
        {
          label,
          text,
          fraction: row.fraction === null ? null : (fraction(row.fraction) ?? null),
          ...(mark === undefined ? {} : { mark }),
        },
        blockTone(row.tone),
      ),
    ];
  });
  return rows.length > 0 ? { kind: 'meters', rows } : undefined;
}
function parseTable(raw: Record<string, unknown>): Block | undefined {
  const head = list(raw.head, LIMITS.tableColumns).map(
    (cell) => cleanText(cell, LIMITS.label) ?? '',
  );
  if (head.length === 0) return undefined;
  const rows = list(raw.rows, LIMITS.tableRows).map((entry) =>
    list(entry, head.length).map((cell) => cleanText(cell, LIMITS.formText) ?? ''),
  );
  const right = list(raw.right, LIMITS.tableColumns).flatMap((n) =>
    Number.isInteger(n) ? [n as number] : [],
  );
  return { kind: 'table', head, rows, right };
}
function parseBullets(raw: Record<string, unknown>): Block | undefined {
  const items = list(raw.items, LIMITS.bullets).flatMap((entry) => {
    const item = fields(entry);
    const text = paragraph(item.text);
    if (!text) return [];
    const term = cleanText(item.term, LIMITS.label);
    return [withTone({ text, ...(term ? { term } : {}) }, blockTone(item.tone))];
  });
  return items.length > 0 ? { kind: 'bullets', items } : undefined;
}
function parseStack(raw: Record<string, unknown>): Block | undefined {
  const parts = list(raw.parts, LIMITS.listItems).flatMap((entry) => {
    const part = fields(entry);
    const label = cleanText(part.label, LIMITS.label);
    const amount = num(part.amount);
    const tone = blockTone(part.tone);
    if (!label || amount === undefined || amount < 0 || !tone) return [];
    const text = cleanText(part.text, LIMITS.label);
    return [{ label, amount, tone, ...(text ? { text } : {}) }];
  });
  return parts.length > 0 ? { kind: 'stack', parts } : undefined;
}
function parseBars(raw: Record<string, unknown>): Block | undefined {
  const chart = fields(raw.chart);
  const values = list(chart.values, LIMITS.chartValues).flatMap((v) => {
    const n = num(v);
    return n === undefined ? [] : [Math.max(0, n)];
  });
  const axis = list(chart.axis, 2).map((a) => cleanText(a, LIMITS.label) ?? '');
  const peak = cleanText(chart.peak, LIMITS.label);
  if (values.length === 0 || axis.length < 2 || !peak) return undefined;
  const current = Number.isInteger(chart.current) ? (chart.current as number) : undefined;
  const tone = blockTone(chart.tone);
  return {
    kind: 'bars',
    chart: {
      values,
      axis: [axis[0] ?? '', axis[1] ?? ''],
      peak,
      ...(current === undefined ? {} : { current }),
      ...(tone ? { tone } : {}),
    },
  };
}
const BLOCKS: Record<string, (raw: Record<string, unknown>) => Block | undefined> = {
  heading: (raw) => {
    const text = cleanText(raw.text, LIMITS.label);
    return text ? { kind: 'heading', text } : undefined;
  },
  facts: parseFacts,
  meters: parseMeters,
  table: parseTable,
  bullets: parseBullets,
  stack: parseStack,
  bars: parseBars,
  note: (raw) => {
    const text = paragraph(raw.text);
    const tone = blockTone(raw.tone);
    return text ? { kind: 'note', text, ...(tone ? { tone } : {}) } : undefined;
  },
  gap: () => ({ kind: 'gap' }),
};

export function parseBlocks(value: unknown, problems: Problems, where: string): Block[] {
  return list(value, LIMITS.blocks).flatMap((entry, index) => {
    const raw = fields(entry);
    const parse =
      typeof raw.kind === 'string' && Object.hasOwn(BLOCKS, raw.kind)
        ? BLOCKS[raw.kind]
        : undefined;
    const block = parse?.(raw);
    if (!block) problems.push(`${where}: block ${index} dropped (unknown kind or empty)`);
    return block ? [block] : [];
  });
}
