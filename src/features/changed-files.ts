import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { readChangedFiles } from '../adapters/git-changed-files.js';
import { MAX_ROWS } from '../core/changed-files.js';
import type { ChangedFile, ChangedFilesState } from '../core/changed-files.js';
import { changedFilesParts, fileRows } from '../ui/changed-files-view.js';
import { outsideCloses } from '../ui/info-screen.js';
import { openPicker } from '../ui/list-picker.js';
import type { PickerChoice } from '../ui/list-picker.js';
import { showFileDiff } from './file-diff.js';

type Theme = Parameters<typeof changedFilesParts>[1];
/** How often the open list looks again; a slow repository stretches this to three times its own read. */
const REFRESH_MS = 2000;

/** Two reads that would draw the same list. */
const signature = (state: ChangedFilesState): string =>
  state.kind === 'files'
    ? state.files
        .map(
          (file) =>
            `${file.path}\0${file.status}\0${file.added}\0${file.removed}\0${JSON.stringify(file.size)}`,
        )
        .join('\n')
    : state.kind;

/** The changed files as the open screen shows them; replaced whole when a new read differs. */
class ChangedList {
  files: ChangedFile[] = [];
  choices: PickerChoice[] = [];
  private rows = new Map<number, string[]>();
  constructor(private state: ChangedFilesState) {
    this.adopt(state);
  }

  private adopt(state: ChangedFilesState): void {
    this.state = state;
    this.files = state.kind === 'files' ? state.files.slice(0, MAX_ROWS) : [];
    this.rows = new Map();
    this.choices = this.files.map((file, index) => ({
      id: file.path,
      search: file.path,
      row: (theme, width) => this.rowAt(index, theme, width),
    }));
  }
  /** The rows for each width, computed once per width: they are aligned over the whole list. */
  private rowAt(index: number, theme: Theme, width: number): string {
    let rows = this.rows.get(width);
    if (!rows) {
      rows = fileRows(this.files, theme, width + 1);
      this.rows.set(width, rows);
    }
    return (rows[index] ?? '').slice(1);
  }
  /** Reads again; true when the list is different now. */
  async refresh(cwd: string): Promise<boolean> {
    const next = await readChangedFiles(cwd);
    if (signature(next) === signature(this.state)) return false;
    this.adopt(next);
    return true;
  }
  header(theme: Theme, width: number): string[] {
    return changedFilesParts(this.state, theme, width).header;
  }
  footer(theme: Theme, width: number): string[] {
    const parts = changedFilesParts(this.state, theme, width);
    if (this.files.length === 0) return parts.rows;
    const left = this.state.kind === 'files' ? this.state.files.length - this.files.length : 0;
    return left > 0
      ? [...parts.footer, theme.fg('dim', ` … ${left.toLocaleString('en-US')} more`)]
      : parts.footer;
  }
  get empty(): string {
    return this.state.kind === 'files' ? 'No matching files' : 'Nothing to show';
  }
}

/**
 * Click on the changed-files icon: the changed files with their size and added/removed lines, a
 * cursor and a search box; Enter shows that file's diff and Esc comes back to the same row. While
 * it is open it looks again every couple of seconds, so new changes appear by themselves.
 */
export async function showChangedFiles(ctx: ExtensionContext): Promise<void> {
  const list = new ChangedList(await readChangedFiles(ctx.cwd));
  let start: string | undefined;
  for (;;) {
    const before = outsideCloses();
    const picked = await openPicker(ctx, {
      title: 'Changed files',
      searchable: true,
      action: 'Enter diff',
      emptyText: list.empty,
      ...(start === undefined ? {} : { start }),
      choices: () => list.choices,
      header: (theme, width) => list.header(theme, width),
      footer: (theme, width) => list.footer(theme, width),
      refresh: { everyMs: REFRESH_MS, work: () => list.refresh(ctx.cwd) },
    });
    const file = list.files.find((candidate) => candidate.path === picked);
    // Closed by a click on its own icon, or by another screen taking over: do not reopen the list.
    if (!file || outsideCloses() !== before) return;
    await showFileDiff(ctx, file);
    if (outsideCloses() !== before) return;
    start = picked;
  }
}
