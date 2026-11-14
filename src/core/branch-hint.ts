import type { GitState } from './model.js';

export function withBranchHint(git: GitState, hint: string | null): GitState {
  const unread = git.branch === null && git.changed === null && git.monitoring === undefined;
  return unread && hint !== null && hint !== '' ? { ...git, branch: hint } : git;
}
