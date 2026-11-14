import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionManager } from '@earendil-works/pi-coding-agent';

export interface Reply {
  input: number;
  read: number;
  output: number;
  total: number;
  after?: number;
}

export class Sessions {
  readonly root = mkdtempSync(join(tmpdir(), 'history-'));
  readonly sessions: string = join(this.root, 'sessions');
  readonly cache = join(this.root, 'cache', 'rollup.json');
  private clock: number;

  constructor(start = Date.UTC(2026, 9, 10, 12, 0, 0), sessions?: string) {
    this.clock = start;
    if (sessions) this.sessions = sessions;
    else mkdirSync(this.sessions);
  }
  folder(name: string): string {
    const path = join(this.root, name);
    mkdirSync(path, { recursive: true });
    return realpathSync(path);
  }
  repository(name: string): string {
    const path = this.folder(name);
    execFileSync('git', ['init', '--quiet', '--initial-branch=main'], { cwd: path });
    execFileSync(
      'git',
      [
        '-c',
        'user.name=t',
        '-c',
        'user.email=t@t',
        'commit',
        '--allow-empty',
        '-m',
        'x',
        '--quiet',
      ],
      { cwd: path },
    );
    return path;
  }
  log(cwd: string, name: string, replies: readonly Reply[]) {
    const manager = SessionManager.create(cwd, join(this.sessions, name));
    for (const reply of replies) this.reply(manager, reply);
    return { manager, file: () => manager.getSessionFile() ?? '' };
  }
  reply(manager: SessionManager, reply: Reply): void {
    this.clock += reply.after ?? 5_000;
    manager.appendMessage({ role: 'user', content: 'go', timestamp: this.clock } as never);
    manager.appendMessage({
      role: 'assistant',
      content: [{ type: 'text', text: 'ok' }],
      api: 'openai-completions',
      provider: 'p',
      model: 'm',
      usage: {
        input: reply.input,
        output: reply.output,
        cacheRead: reply.read,
        cacheWrite: 0,
        totalTokens: reply.input + reply.read + reply.output,
        cost: {
          input: reply.total / 4,
          output: reply.total / 4,
          cacheRead: reply.total / 4,
          cacheWrite: reply.total / 4,
          total: reply.total,
        },
      },
      stopReason: 'stop',
      timestamp: this.clock,
    } as never);
  }
}
