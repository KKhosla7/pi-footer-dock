import type { GitState } from './model.js';

/**
 * Until Git has been read, the branch Pi already knows (it reads `.git/HEAD` at once) is shown, so
 * the footer names the branch from its first draw instead of after the first `git status`. Counts
 * stay unknown until they are read; a state that is already known is never touched.
 */
export function withBranchHint(git: GitState, hint: string | null): GitState {
  const unread = git.branch === null && git.changed === null && git.monitoring === undefined;
  return unread && hint !== null && hint !== '' ? { ...git, branch: hint } : git;
}
