import type { Block, Fact, Tone } from './blocks.js';
import { INDENT, MAX_LABEL, blank, fit, pad, plain, width, wrapStyled } from './style.js';
import type { Ctx } from './style.js';

type Of<K extends Block['kind']> = Extract<Block, { kind: K }>;

export function headingLines(block: Of<'heading'>, { style, width: room }: Ctx): string[] {
  return [INDENT + style.bold(style.fg('accent', fit(plain(block.text), room - 2)))];
}

function factLine(row: Fact, labelWidth: number, { style, width: room }: Ctx): string[] {
  const label = pad(fit(plain(row.label), labelWidth), labelWidth);
  const lead = `${INDENT}${style.fg('muted', label)}  `;
  const value = plain(row.value);
  const aside = row.note ? plain(row.note) : '';
  const left = room - width(lead);
  if (width(value) + (aside ? width(aside) + 2 : 0) <= left) {
    const shown = row.tone ? style.fg(row.tone, value) : value;
    return [lead + shown + (aside ? `  ${style.fg('dim', aside)}` : '')];
  }
  const text = aside ? `${value} · ${aside}` : value;
  return wrapStyled(row.tone ? style.fg(row.tone, text) : text, left, lead, blank(width(lead)));
}

export function factLines(block: Of<'facts'>, ctx: Ctx): string[] {
  const labelWidth = Math.min(
    MAX_LABEL,
    Math.max(0, ...block.rows.map((row) => width(plain(row.label)))),
  );
  return block.rows.flatMap((row) => factLine(row, labelWidth, ctx));
}

export function bulletLines(block: Of<'bullets'>, { style, width: room }: Ctx): string[] {
  return block.items.flatMap((item) => {
    const lead = `${INDENT}${style.fg(item.tone ?? 'muted', '•')} `;
    const term = item.term ? `${style.bold(`${plain(item.term)}:`)} ` : '';
    const text = plain(item.text);
    return wrapStyled(
      term + (item.tone ? style.fg(item.tone, text) : text),
      room - width(lead),
      lead,
      blank(width(lead)),
    );
  });
}

export function noteLines(block: Of<'note'>, { style, width: room }: Ctx): string[] {
  const tone: Tone | undefined = block.tone;
  const text = block.text.split('\n').map(plain).join('\n');
  return wrapStyled(tone ? style.fg(tone, text) : text, room - 2 * INDENT.length, INDENT, INDENT);
}
