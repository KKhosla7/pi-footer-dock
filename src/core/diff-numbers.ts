export interface NumberedLine {
  raw: string;
  newNo?: number;
  oldNo?: number;
  kind: 'header' | 'hunk' | 'add' | 'del' | 'context' | 'meta';
}
const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/u;

export function numberLines(lines: readonly string[]): NumberedLine[] {
  let oldNo = 0;
  let newNo = 0;
  let inHunk = false;
  return lines.map((raw): NumberedLine => {
    const hunk = HUNK.exec(raw);
    if (hunk) {
      oldNo = Number(hunk[1]);
      newNo = Number(hunk[2]);
      inHunk = true;
      return { raw, kind: 'hunk' };
    }
    if (!inHunk || raw.startsWith('diff --git ')) {
      inHunk &&= !raw.startsWith('diff --git ');
      return { raw, kind: 'header' };
    }
    if (raw.startsWith('+')) return { raw, kind: 'add', newNo: newNo++ };
    if (raw.startsWith('-')) return { raw, kind: 'del', oldNo: oldNo++ };
    if (raw.startsWith('\\')) return { raw, kind: 'meta' };
    return { raw, kind: 'context', oldNo: oldNo++, newNo: newNo++ };
  });
}

export interface ChangeRange {
  from: number;
  to: number;
  removedOnly: boolean;
}

const isChange = (line: NumberedLine): boolean => line.kind === 'add' || line.kind === 'del';

function blockRange(
  block: readonly NumberedLine[],
  after: NumberedLine | undefined,
  before: number,
): ChangeRange {
  const added = block.filter((line) => line.kind === 'add');
  const first = added[0]?.newNo;
  const last = added.at(-1)?.newNo;
  if (first !== undefined && last !== undefined)
    return { from: first, to: last, removedOnly: false };
  const at = after?.newNo ?? before;
  return { from: at, to: at, removedOnly: true };
}

export function changeRanges(lines: readonly NumberedLine[]): ChangeRange[] {
  const ranges: ChangeRange[] = [];
  let lastNew = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;
    if (!isChange(line)) {
      lastNew = line.newNo ?? lastNew;
      continue;
    }
    let end = index;
    for (let next = lines[end + 1]; next && isChange(next); next = lines[end + 1]) end += 1;
    const block = lines.slice(index, end + 1);
    ranges.push(blockRange(block, lines[end + 1], lastNew + 1));
    lastNew = block.at(-1)?.newNo ?? lastNew;
    index = end;
  }
  return ranges;
}

export function formatRanges(ranges: readonly ChangeRange[], max = 8): string {
  const shown = ranges.slice(0, max).map((range) => {
    const text = range.from === range.to ? `${range.from}` : `${range.from}–${range.to}`;
    return range.removedOnly ? `${text} (removed)` : text;
  });
  const more = ranges.length - shown.length;
  return more > 0 ? `${shown.join(', ')}, … ${more} more` : shown.join(', ');
}
