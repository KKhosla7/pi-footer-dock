const SAFE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._/+@-]*$/u;

export type SwitchCommand = { ok: true; command: string } | { ok: false; reason: string };

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
