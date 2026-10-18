import { createHash } from 'node:crypto';
import { realpath } from 'node:fs/promises';
import { dirname, resolve, basename } from 'node:path';
import { projectLabel } from '../../core/history/rows.js';
import type { ProjectInfo } from '../../core/history/rows.js';
import { gitLine, gitOutput } from '../git-command.js';

const hash = (text: string): string => createHash('sha256').update(text).digest('hex').slice(0, 16);

/** The folder as the project: a Git repository's main working tree, so its worktrees join it. */
async function projectRoot(cwd: string, signal: AbortSignal): Promise<string> {
  const real = await realpath(cwd).catch(() => cwd);
  try {
    const out = gitLine(await gitOutput(real, ['rev-parse', '--git-common-dir'], signal)).trim();
    if (out.length === 0) return real;
    const common = resolve(real, out);
    return basename(common) === '.git' ? dirname(common) : common;
  } catch {
    return real;
  }
}

/** Resolves log folders to projects, remembering each folder so Git is asked once. */
export class ProjectResolver {
  private readonly known = new Map<string, ProjectInfo>();
  async resolve(cwd: string, signal: AbortSignal): Promise<ProjectInfo> {
    const have = this.known.get(cwd);
    if (have) return have;
    const root = await projectRoot(cwd, signal);
    const info = { key: hash(root), label: projectLabel(root) };
    this.known.set(cwd, info);
    return info;
  }
}
