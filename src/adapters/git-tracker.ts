import { unknownGit } from './git.js';
import { GitMonitor } from './git-monitor.js';
import { withBranchHint } from '../core/branch-hint.js';
import type { GitState } from '../core/model.js';

/** The latest Git state of the session's working directory, kept in step as it changes. */
export class GitTracker {
  state: GitState = unknownGit;
  /** The branch Pi's own footer data knows: shown from the first draw, before Git has been read. */
  branchHint: () => string | null = () => null;
  private monitor: GitMonitor | undefined;
  constructor(private readonly changed: () => void) {}

  start(cwd: string): void {
    this.state = unknownGit;
    this.monitor = new GitMonitor(cwd, this.accept);
  }
  /** What the footer shows: the state read from Git, or just the branch until it has been read. */
  get shown(): GitState {
    return withBranchHint(this.state, this.branchHint());
  }
  /** True when the working directory is not the one being watched. */
  moved(cwd: string): boolean {
    return this.monitor?.cwd !== cwd;
  }
  /** Asks for fresh data, first following a change of working directory. */
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
