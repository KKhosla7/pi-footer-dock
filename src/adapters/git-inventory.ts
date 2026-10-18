import { opendir, realpath, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { gitOutput, missingGitPath } from './git-command.js';
import { nearestGitDirectory } from './git-scope.js';
import type { GitScope } from './git-scope.js';
import type { GitWatchEnsure, GitWatchFilter, GitWatchKind } from './git-watch-set.js';

export interface GitWatchLimits {
  maxWatches: number;
  maxEntries: number;
}
interface Budget {
  entries: number;
  bytes: number;
  maxEntries: number;
}
interface Role {
  filter: GitWatchFilter | undefined;
  kind: GitWatchKind;
}

async function children(path: string, budget: Budget): Promise<string[]> {
  const dirs: string[] = [];
  let directory;
  try {
    directory = await opendir(path);
  } catch (error) {
    if (missingGitPath(error)) return dirs;
    throw error;
  }
  for await (const entry of directory) {
    budget.entries += 1;
    if (budget.entries > budget.maxEntries) throw new Error('Git inventory entry budget exceeded');
    if (!entry.isDirectory() || entry.name === '.git') continue;
    const child = join(path, entry.name);
    budget.bytes += Buffer.byteLength(child);
    if (budget.bytes > 2 * 1024 * 1024) throw new Error('Git inventory path budget exceeded');
    dirs.push(child);
  }
  return dirs;
}

async function trackedParents(
  scope: GitScope,
  signal: AbortSignal,
  limit: number,
): Promise<Set<string>> {
  const tracked = await gitOutput(scope.root, ['ls-files', '--cached', '-z'], signal);
  const parents = new Set([scope.root]);
  const prefix = scope.root.endsWith(sep) ? scope.root : scope.root + sep;
  for (const name of tracked.split('\0').filter(Boolean)) {
    let parent = dirname(resolve(scope.root, name));
    while (parent !== scope.root && parent.startsWith(prefix)) {
      parents.add(parent);
      if (parents.size > limit) throw new Error('Git tracked directory budget exceeded');
      parent = dirname(parent);
    }
  }
  return parents;
}

async function metadataTargets(logical: string): Promise<Set<string>> {
  const targets = new Set([logical]);
  try {
    targets.add(await realpath(logical));
  } catch (error) {
    if (!missingGitPath(error)) throw error;
  }
  return targets;
}

/** Watch-before-scan inventory; ignored trees are pruned unless tracked descendants require them. */
class GitInventory {
  readonly desired = new Set<string>();
  private readonly roles = new Map<string, Role>();
  private readonly budget: Budget;
  constructor(
    private readonly scope: GitScope,
    private readonly ensure: GitWatchEnsure,
    private readonly signal: AbortSignal,
    private readonly limits: GitWatchLimits,
  ) {
    this.budget = { entries: 0, bytes: 0, maxEntries: limits.maxEntries };
  }
  private add(path: string, filter?: GitWatchFilter, kind: GitWatchKind = 'work'): void {
    if (this.desired.size >= this.limits.maxWatches && !this.desired.has(path))
      throw new Error('Git watcher budget exceeded');
    const prior = this.roles.get(path);
    const combined = prior ? this.combine(prior.filter, filter) : filter;
    const role = prior?.kind === 'meta' || kind === 'meta' ? 'meta' : 'work';
    this.roles.set(path, { filter: combined, kind: role });
    this.ensure(path, combined, role);
    this.desired.add(path);
  }
  private combine(
    first: GitWatchFilter | undefined,
    next: GitWatchFilter | undefined,
  ): GitWatchFilter | undefined {
    return first && next ? (name) => first(name) || next(name) : undefined;
  }
  private async target(path: string): Promise<void> {
    const parent = await nearestGitDirectory(dirname(path));
    const name = relative(parent, path).split(sep)[0];
    this.add(parent, (filename) => !filename || filename === name, 'meta');
  }
  async worktree(): Promise<void> {
    const { root } = this.scope;
    const parents = await trackedParents(this.scope, this.signal, this.limits.maxWatches);
    const ancestor = await nearestGitDirectory(dirname(root));
    this.add(ancestor, (name) => !name || name === relative(ancestor, root).split(sep)[0]);
    this.add(root);
    let layer = [root];
    while (layer.length) {
      this.signal.throwIfAborted();
      const candidates: string[] = [];
      for (const parent of layer) candidates.push(...(await children(parent, this.budget)));
      if (!candidates.length) break;
      const names = candidates.map((path) => relative(root, path).split(sep).join('/') + '/');
      const ignored = new Set(
        (
          await gitOutput(root, ['check-ignore', '--stdin', '-z'], this.signal, {
            input: names.join('\0') + '\0',
            allowNoMatch: true,
          })
        ).split('\0'),
      );
      layer = candidates.filter((path, i) => parents.has(path) || !ignored.has(names[i] ?? ''));
      for (const path of layer) this.add(path);
    }
  }
  private async metadataTree(path: string): Promise<void> {
    try {
      if (!(await stat(path)).isDirectory()) return;
    } catch (error) {
      if (missingGitPath(error)) return;
      throw error;
    }
    const queue = [path];
    while (queue.length) {
      this.signal.throwIfAborted();
      const current = queue.pop();
      if (!current) continue;
      this.add(current, undefined, 'meta');
      queue.push(...(await children(current, this.budget)));
    }
  }
  async metadata(): Promise<void> {
    for (const base of new Set([this.scope.admin, this.scope.common])) {
      this.add(base, undefined, 'meta');
      for (const name of ['refs', 'reftable', 'info']) await this.metadataTree(join(base, name));
    }
    for (const logical of [this.scope.globalIgnore, ...this.scope.configFiles]) {
      this.signal.throwIfAborted();
      for (const target of await metadataTargets(logical)) await this.target(target);
    }
  }
}

export async function gitInventory(
  scope: GitScope,
  ensure: GitWatchEnsure,
  signal: AbortSignal,
  limits: GitWatchLimits,
): Promise<Set<string>> {
  const plan = new GitInventory(scope, ensure, signal, limits);
  await plan.worktree();
  await plan.metadata();
  return plan.desired;
}
