import { basename, dirname, join } from 'node:path';
import { stat } from 'node:fs/promises';
import { missingGitPath } from './git-command.js';
import { discoverGitScope, nearestGitDirectory } from './git-scope.js';
import { gitInventory } from './git-inventory.js';
import type { GitWatchLimits } from './git-inventory.js';
import type { GitWatchSet } from './git-watch-set.js';

/** Opens a watcher for every directory whose changes can change the status, within the limits. */
export async function bootstrapWatches(
  cwd: string,
  watches: GitWatchSet,
  limits: GitWatchLimits,
  signal: AbortSignal,
): Promise<void> {
  const ancestor = await nearestGitDirectory(cwd);
  watches.ensure(ancestor);
  watches.ensure(dirname(ancestor), (name) => !name || name === basename(ancestor));
  try {
    const marker = join(cwd, '.git');
    if ((await stat(marker)).isDirectory()) watches.ensure(marker, undefined, 'meta');
  } catch (error) {
    if (!missingGitPath(error)) throw error;
  }
  const scope = await discoverGitScope(cwd, signal);
  watches.ensure(scope.root);
  watches.retain(new Set([ancestor, dirname(ancestor), scope.root]));
  const desired = await gitInventory(
    scope,
    (path, filter, kind) => {
      watches.ensure(path, filter, kind);
    },
    signal,
    limits,
  );
  signal.throwIfAborted();
  watches.retain(desired);
}
