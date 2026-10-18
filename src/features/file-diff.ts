import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { readFileDiff } from '../adapters/git-diff.js';
import type { DiffResult } from '../adapters/git-diff.js';
import type { ChangedFile } from '../core/changed-files.js';
import { changeRanges, formatRanges, numberLines } from '../core/diff-numbers.js';
import type { NumberedLine } from '../core/diff-numbers.js';
import { diffLine } from '../core/diff-lines.js';
import { fileSummary } from '../ui/changed-files-view.js';
import { openInfoScreen } from '../ui/info-screen.js';

type Style = Parameters<typeof diffLine>[1];
const REFRESH_MS = 2000;
const MIN_GUTTER = 3;

/** A diff read, with its lines numbered once. */
class DiffView {
  numbered: NumberedLine[] = [];
  constructor(private result: DiffResult) {
    this.adopt(result);
  }
  private adopt(result: DiffResult): void {
    this.result = result;
    this.numbered = result.ok ? numberLines(result.lines) : [];
  }
  /** True when a new read differs from what is on screen. */
  replace(next: DiffResult): boolean {
    const same = JSON.stringify(next) === JSON.stringify(this.result);
    if (!same) this.adopt(next);
    return !same;
  }
  /** Where the changes are in the file as it is now, for finding them in an editor. */
  header(file: ChangedFile, style: Style): string[] {
    const ranges = this.numbered.length > 0 ? changeRanges(this.numbered) : [];
    const first = ranges[0];
    if (!first) return [];
    return [
      style.fg('muted', ` Changed lines: ${formatRanges(ranges)}`),
      style.fg('dim', ` First change: ${file.path}:${first.from}`),
    ];
  }
  body(style: Style, width: number): string[] {
    const result = this.result;
    if (!result.ok) return [style.fg('muted', ` ${result.message}`)];
    if (this.numbered.length === 0)
      return [style.fg('muted', ' No changes in this file any more.')];
    const widest = Math.max(
      MIN_GUTTER,
      ...this.numbered.map((line) => String(line.newNo ?? line.oldNo ?? 0).length),
    );
    const lines = this.numbered.map((line) => {
      const gutter =
        line.newNo === undefined ? ' '.repeat(widest) : String(line.newNo).padStart(widest);
      return diffLine(line.raw, style, width, gutter);
    });
    return result.omitted > 0
      ? [
          ...lines,
          style.fg('muted', ` … ${result.omitted.toLocaleString('en-US')} more lines not shown`),
        ]
      : lines;
  }
}

/**
 * Enter on a changed file: what changed in it, coloured like `git diff`, with the line numbers it
 * has now in the left margin and the changed stretches listed on top, so it can be found in an
 * editor. It looks again while open. Esc goes back to the list.
 */
export async function showFileDiff(ctx: ExtensionContext, file: ChangedFile): Promise<void> {
  const view = new DiffView(await readFileDiff(ctx.cwd, file));
  await openInfoScreen(ctx, {
    title: 'Changed files › Diff',
    header: (theme, width) => [fileSummary(file, theme, width), ...view.header(file, theme), ''],
    lines: (theme, width) => view.body(theme, width),
    refresh: {
      everyMs: REFRESH_MS,
      work: async () => view.replace(await readFileDiff(ctx.cwd, file)),
    },
  });
}
