import type { Problem } from './core/problems.js';

export class ProblemState {
  private list: readonly Problem[] = [];
  private seen = false;

  get problems(): readonly Problem[] {
    return this.list;
  }
  get count(): number {
    return this.list.length;
  }
  get alerting(): boolean {
    return this.list.length > 0 && !this.seen;
  }
  set(problems: readonly Problem[]): void {
    if (JSON.stringify(problems) !== JSON.stringify(this.list)) this.seen = false;
    this.list = problems;
  }
  acknowledge(): void {
    this.seen = true;
  }
}
