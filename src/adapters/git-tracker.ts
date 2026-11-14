import { unknownGit } from './git.js';
import { GitMonitor } from './git-monitor.js';
import { withBranchHint } from '../core/branch-hint.js';
import type { GitState } from '../core/model.js';

export class GitTracker {
  state: GitState = unknownGit;
  branchHint: () => string | null = () => null;
  private monitor: GitMonitor | undefined;
  constructor(private readonly changed: () => void) {}

  start(cwd: string): void {
    this.state = unknownGit;
    this.monitor = new GitMonitor(cwd, this.accept);
  }
  get shown(): GitState {
    return withBranchHint(this.state, this.branchHint());
  }
  moved(cwd: string): boolean {
    return this.monitor?.cwd !== cwd;
  }
  refresh(cwd: string): void {
    if (!this.monitor) return;
    if (this.monitor.cwd !== cwd) {
      this.monitor.dispose();
      this.start(cwd);
    }
    this.monitor.request(true);
  }
  stats(): ReturnType<GitMonitor['stats']> | undefined {
    return this.monitor?.stats();
  }
  stop(): void {
    this.monitor?.dispose();
    this.monitor = undefined;
  }
  private readonly accept = (git: GitState): void => {
    this.state = git;
    this.changed();
  };
}
