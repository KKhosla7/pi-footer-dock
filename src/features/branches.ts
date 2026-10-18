import type { ExtensionContext } from '@earendil-works/pi-coding-agent';
import { loadBranches } from '../adapters/git-branches.js';
import { branchLines, branchRows, SECTION_LIMIT } from '../core/branch-lines.js';
import type { Branch, BranchList } from '../core/branches.js';
import { switchCommand } from '../core/branch-switch.js';
import { openInfoScreen } from '../ui/info-screen.js';
import { openPicker } from '../ui/list-picker.js';
import type { PickerChoice } from '../ui/list-picker.js';
import { say } from '../notify.js';

const QUERY_TIMEOUT_MS = 5000;

interface Entry {
  branch: Branch;
  remote: boolean;
}

/** Both lists as picker choices (local, then remote), and what each choice stands for. */
function branchChoices(
  list: BranchList,
  locals: ReadonlySet<string>,
  now: number,
): { choices: PickerChoice[]; entries: Map<string, Entry> } {
  const entries = new Map<string, Entry>();
  const sections = [
    { title: 'Local branches', note: '', remote: false, all: list.locals.slice(0, SECTION_LIMIT) },
    {
      title: 'Remote branches',
      note: 'as of the last fetch, no network',
      remote: true,
      all: list.remotes.slice(0, SECTION_LIMIT),
    },
  ];
  const choices = sections.flatMap(({ title, note, remote, all }) => {
    const rows = new Map<number, string[]>();
    return all.map((branch, index): PickerChoice => {
      const id = `${remote ? 'remote' : 'local'}:${branch.name}`;
      entries.set(id, { branch, remote });
      const command = switchCommand({ name: branch.name, remote, current: branch.current }, locals);
      return {
        id,
        search: branch.name,
        section: `${title} (${all.length})`,
        ...(note ? { sectionNote: note } : {}),
        detail: command.ok ? `Enter puts  ${command.command}  in the editor` : command.reason,
        row: (theme, width) => {
          if (!rows.has(width)) rows.set(width, branchRows(all, theme, width + 1, now));
          return (rows.get(width)?.[index] ?? '').slice(1);
        },
      };
    });
  });
  return { choices, entries };
}

/** Puts the command in the editor for the user to run; never runs it, never overwrites a draft. */
function offer(ctx: ExtensionContext, entry: Entry, locals: ReadonlySet<string>): void {
  const command = switchCommand(
    { name: entry.branch.name, remote: entry.remote, current: entry.branch.current },
    locals,
  );
  if (!command.ok) say(ctx, command.reason, 'info');
  else if (ctx.ui.getEditorText().trim() !== '')
    say(ctx, 'Your message box has text. Clear it, then choose the branch again.', 'info');
  else {
    ctx.ui.setEditorText(command.command);
    say(ctx, 'Press Enter to switch branches. Nothing has run yet.', 'info');
  }
}

/** Click on the branch icon: local and remote branches (read once, when the screen opens). */
export async function showBranches(ctx: ExtensionContext): Promise<void> {
  const result = await loadBranches(ctx.cwd, AbortSignal.timeout(QUERY_TIMEOUT_MS));
  const now = Math.floor(Date.now() / 1000);
  if (!result.ok || (result.list.locals.length === 0 && result.list.remotes.length === 0)) {
    await openInfoScreen(ctx, {
      title: 'Branches',
      lines: (theme, width) => branchLines(result, theme, width, now),
    });
    return;
  }
  const { list } = result;
  const locals = new Set(list.locals.map((branch) => branch.name));
  const { choices, entries } = branchChoices(list, locals, now);
  const current = list.locals.find((branch) => branch.current);
  const picked = await openPicker(ctx, {
    title: 'Branches',
    searchable: true,
    action: 'Enter prepares the switch',
    ...(current ? { start: `local:${current.name}` } : {}),
    choices,
    header: (theme) =>
      list.detached
        ? [theme.fg('warning', ' HEAD is detached: no local branch is checked out.'), '']
        : [],
  });
  const entry = picked === undefined ? undefined : entries.get(picked);
  if (entry) offer(ctx, entry, locals);
}
