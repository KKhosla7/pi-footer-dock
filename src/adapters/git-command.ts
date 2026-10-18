import { execFile } from 'node:child_process';
import { inertArguments } from './git-inert.js';

export interface GitCommandOptions {
  input?: string;
  allowNoMatch?: boolean;
}

/**
 * Bounded read-only Git metadata query: no shell, no network, optional index locks off, and every
 * program the repository's own config would make git run switched off (see `git-inert.ts`).
 */
export async function gitOutput(
  cwd: string,
  args: string[],
  signal: AbortSignal,
  options: GitCommandOptions = {},
): Promise<string> {
  const inert = await inertArguments(cwd, signal);
  return new Promise((accept, reject) => {
    let inputError: Error | undefined;
    const child = execFile(
      'git',
      ['--no-optional-locks', ...inert, ...args],
      {
        cwd,
        signal,
        timeout: 3000,
        maxBuffer: 2 * 1024 * 1024,
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' },
      },
      (error, stdout) => {
        if (error && !(options.allowNoMatch && error.code === 1))
          reject(new Error('Git metadata query failed', { cause: error }));
        else if (inputError) reject(inputError);
        else accept(stdout);
      },
    );
    child.stdin?.on('error', (error: Error) => {
      inputError = error;
    });
    child.stdin?.end(options.input);
  });
}

export function gitLine(raw: string): string {
  return raw.endsWith('\n') ? raw.slice(0, -1) : raw;
}

export function missingGitPath(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  );
}
