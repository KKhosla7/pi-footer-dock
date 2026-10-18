import { stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { gitLine, gitOutput, missingGitPath } from './git-command.js';
import { gitConfigFiles } from './git-config.js';

export interface GitScope {
  root: string;
  admin: string;
  common: string;
  globalIgnore: string;
  configFiles: string[];
}

export async function discoverGitScope(cwd: string, signal: AbortSignal): Promise<GitScope> {
  const root = gitLine(await gitOutput(cwd, ['rev-parse', '--show-toplevel'], signal));
  const admin = gitLine(await gitOutput(cwd, ['rev-parse', '--absolute-git-dir'], signal));
  const common = gitLine(
    await gitOutput(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir'], signal),
  );
  const extra = gitLine(
    await gitOutput(cwd, ['config', '--path', '--get', 'core.excludesFile'], signal, {
      allowNoMatch: true,
    }),
  );
  const globalIgnore =
    extra || join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'git', 'ignore');
  return { root, admin, common, globalIgnore, configFiles: await gitConfigFiles(root, signal) };
}

export async function nearestGitDirectory(path: string): Promise<string> {
  let current = path;
  for (;;) {
    try {
      if ((await stat(current)).isDirectory()) return current;
    } catch (error) {
      if (!missingGitPath(error)) throw error;
    }
    const parent = dirname(current);
    if (parent === current) throw new Error('No watchable Git ancestor');
    current = parent;
  }
}
