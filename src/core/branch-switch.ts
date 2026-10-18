/** Names that are safe to put in a shell command as they are: the usual branch characters, nothing a shell reads. */
const SAFE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._/+@-]*$/u;

export type SwitchCommand = { ok: true; command: string } | { ok: false; reason: string };

/**
 * The command to type for switching to a branch, as Pi's `!` runs it. Footer Dock never runs it: it
 * only offers the text, so the user reads it and presses Enter. A remote branch with no local
 * branch of the same short name is switched to with `--track`, which creates the local one.
 */
export function switchCommand(
  branch: { name: string; remote: boolean; current: boolean },
  locals: ReadonlySet<string>,
): SwitchCommand {
  if (branch.current) return { ok: false, reason: 'You are already on this branch.' };
  if (!SAFE_NAME.test(branch.name))
    return {
      ok: false,
      reason:
        'This branch name has characters that are not safe to put in a command here. Run git switch yourself.',
    };
  if (!branch.remote) return { ok: true, command: `!git switch -- ${branch.name}` };
  const short = branch.name.slice(branch.name.indexOf('/') + 1);
  return locals.has(short)
    ? { ok: true, command: `!git switch -- ${short}` }
    : { ok: true, command: `!git switch --track -- ${branch.name}` };
}
