import { spawn } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { launchFor } from '../core/open-folder.js';

export type OpenResult = { ok: true } | { ok: false; message: string };
const fail = (message: string): OpenResult => ({ ok: false, message });

/**
 * Opens `directory` with the platform's file manager or the user's own command. No shell is used,
 * so the folder is one inert argument; the child is detached with no pipes and never awaited.
 */
export async function openFolder(
  directory: string,
  openWith: readonly string[] | undefined,
  platform: string = process.platform,
): Promise<OpenResult> {
  try {
    if (!(await stat(directory)).isDirectory())
      return fail('The project folder is not a directory.');
  } catch {
    return fail('The project folder no longer exists.');
  }
  const { command, args } = launchFor(directory, openWith, platform);
  return new Promise<OpenResult>((resolve) => {
    const child = spawn(command, args, { shell: false, detached: true, stdio: 'ignore' });
    child.once('error', () => {
      resolve(fail(`Could not start "${command}". Choose another app with /dock-open-with.`));
    });
    child.once('spawn', () => {
      child.unref();
      resolve({ ok: true });
    });
  });
}
