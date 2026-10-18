import { dirname, isAbsolute, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { gitOutput } from './git-command.js';

function includePath(source: string, value: string): string {
  if (value.includes('%(')) throw new Error('Unsupported Git include interpolation');
  if (value.startsWith('~/')) return join(homedir(), value.slice(2));
  return isAbsolute(value) ? value : resolve(dirname(source), value);
}

/** Select ignore/include origins only; never enumerate unrelated credential/config values. */
export async function gitConfigFiles(root: string, signal: AbortSignal): Promise<string[]> {
  const xdg = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
  const files = new Set(
    process.env.GIT_CONFIG_GLOBAL
      ? [resolve(process.env.GIT_CONFIG_GLOBAL)]
      : [join(homedir(), '.gitconfig'), join(xdg, 'git', 'config')],
  );
  if (!process.env.GIT_CONFIG_NOSYSTEM)
    files.add(process.env.GIT_CONFIG_SYSTEM ?? '/etc/gitconfig');
  const raw = await gitOutput(
    root,
    [
      'config',
      '--null',
      '--show-origin',
      '--get-regexp',
      '^(include\\.path|includeif\\..*\\.path|core\\.excludesfile)$',
    ],
    signal,
    { allowNoMatch: true },
  );
  const records = raw.split('\0');
  for (let i = 0; i + 1 < records.length; i += 2) {
    const origin = records[i] ?? '';
    const pair = records[i + 1] ?? '';
    if (!origin.startsWith('file:')) continue;
    const source = resolve(root, origin.slice(5));
    files.add(source);
    const split = pair.indexOf('\n');
    if (split < 0) throw new Error('Invalid Git config origin');
    if (!pair.slice(0, split).toLowerCase().startsWith('include')) continue;
    const value = pair.slice(split + 1);
    if (value) files.add(includePath(source, value));
  }
  return [...files];
}
