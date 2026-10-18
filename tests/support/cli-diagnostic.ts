import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { once } from 'node:events';

function notificationMessage(line: string): string | undefined {
  const event: unknown = JSON.parse(line);
  if (typeof event !== 'object' || event === null) return undefined;
  if (!('type' in event) || event.type !== 'extension_ui_request') return undefined;
  if (!('method' in event) || event.method !== 'notify') return undefined;
  return 'message' in event && typeof event.message === 'string' ? event.message : undefined;
}

interface CliDiagnosticOptions {
  cwd: string;
  agentDir: string;
  sessionDir: string;
  resume?: string;
}

function cliArgs(options: CliDiagnosticOptions): string[] {
  const entry = fileURLToPath(import.meta.resolve('@earendil-works/pi-coding-agent'));
  const cli = join(dirname(entry), 'bundle/cli.js');
  return [
    cli,
    '--offline',
    '-ne',
    '-ns',
    '-np',
    '-nc',
    '-na',
    '--mode',
    'rpc',
    '-e',
    resolve('src/index.ts'),
    '--provider',
    'integration-a',
    '--model',
    'test-model',
    '--session-dir',
    options.sessionDir,
    ...(options.resume ? ['--session', options.resume] : []),
  ];
}

/** Launch the real Pi CLI, not a mocked ExtensionContext or SDK adapter. */
export async function cliDiagnostic(options: CliDiagnosticOptions): Promise<string> {
  const child = spawn(process.execPath, cliArgs(options), {
    cwd: options.cwd,
    env: { ...process.env, PI_CODING_AGENT_DIR: options.agentDir },
  });
  const lines = createInterface({ input: child.stdout });
  let stderr = '';
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await new Promise<string>((resolveReport, reject) => {
      timeout = setTimeout(() => {
        reject(new Error(`Pi CLI diagnostic timeout: ${stderr}`));
      }, 15_000);
      child.on('error', reject);
      child.on('exit', (code) => {
        reject(new Error(`Pi CLI exited (${String(code)}): ${stderr}`));
      });
      lines.on('line', (line) => {
        try {
          const message = notificationMessage(line);
          if (message?.includes('"diagnosticVersion"')) resolveReport(message);
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)));
        }
      });
      child.stdin.write(
        JSON.stringify({ type: 'prompt', id: 'diagnostic', message: '/dock-debug' }) + '\n',
      );
    });
  } finally {
    if (timeout) clearTimeout(timeout);
    lines.close();
    if (child.exitCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
}
