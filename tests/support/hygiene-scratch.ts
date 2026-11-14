import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const script = join(import.meta.dirname, '../../scripts/check-hygiene.sh');
const publicFiles = join(import.meta.dirname, '../../scripts/public-files.sh');
export const exporter = join(import.meta.dirname, '../../scripts/export-public.sh');
export const GITHUB = '4499768+someone@users.noreply.github.com';
export const PERSONAL = ['jane', 'mail.test'].join('@');
export const LINUX_HOME = ['/home', 'jane', 'Projects', 'x', ''].join('/');
export const MAC_HOME = ['/Users', 'jane', 'Projects', 'x', ''].join('/');
export const NEUTRAL_GIT = { GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null' };

export function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'hygiene-'));
  const git = (args: string[], env: Record<string, string> = {}): string =>
    execFileSync('git', args, {
      cwd: dir,
      env: { ...process.env, ...NEUTRAL_GIT, ...env },
      encoding: 'utf8',
    });
  git(['init', '-q', '-b', 'main']);
  mkdirSync(join(dir, 'scripts'));
  copyFileSync(script, join(dir, 'scripts/check-hygiene.sh'));
  copyFileSync(publicFiles, join(dir, 'scripts/public-files.sh'));
  const commit = (message: string, author = GITHUB, committer = author): string => {
    git(['add', '-A']);
    git(['commit', '-q', '-m', message], {
      GIT_AUTHOR_NAME: 'A',
      GIT_AUTHOR_EMAIL: author,
      GIT_COMMITTER_NAME: 'C',
      GIT_COMMITTER_EMAIL: committer,
    });
    return git(['rev-parse', 'HEAD']).trim();
  };
  const write = (name: string, text: string): void => {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), text);
  };
  const check = (base?: string) =>
    spawnSync('sh', ['scripts/check-hygiene.sh', ...(base ? [base] : [])], {
      cwd: dir,
      encoding: 'utf8',
    });
  write('README.md', 'Fixtures: a@example.com and /home/someone/project/\n');
  const first = commit('First');
  return {
    git,
    commit,
    write,
    check,
    first,
    done: () => {
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    },
  };
}
