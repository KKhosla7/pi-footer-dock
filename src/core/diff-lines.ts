import { stripTerminalSequences, truncateToWidth } from '@earendil-works/pi-tui';

/** The part of Pi's theme the diff view uses. */
export interface DiffStyle {
  fg(colour: 'accent' | 'success' | 'error' | 'muted' | 'dim', text: string): string;
}

const TAB = '    ';
/** File content is untrusted text: no terminal sequences, no controls, tabs as spaces. */
const clean = (line: string): string =>
  stripTerminalSequences(line)
    .replace(/\t/gu, TAB)
    // eslint-disable-next-line no-control-regex -- removing controls is the point
    .replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/gu, '');

const HEADER =
  /^(diff --git |index |--- |\+\+\+ |new file mode|deleted file mode|old mode|new mode|similarity index|rename (from|to) |copy (from|to) )/u;

/** Colours one line of `git diff` by what it is: header, hunk, added, removed, context. */
export function diffLine(line: string, style: DiffStyle, width: number, gutter = ''): string {
  const text = clean(line);
  let styled = text;
  if (HEADER.test(line)) styled = style.fg('dim', text);
  else if (line.startsWith('@@')) styled = style.fg('accent', text);
  else if (line.startsWith('+')) styled = style.fg('success', text);
  else if (line.startsWith('-')) styled = style.fg('error', text);
  else if (line.startsWith('\\') || line.startsWith('Binary files'))
    styled = style.fg('muted', text);
  const number = gutter === '' ? '' : `${style.fg('dim', gutter)} `;
  return truncateToWidth(` ${number}${styled}`, Math.max(1, width), '…');
}
