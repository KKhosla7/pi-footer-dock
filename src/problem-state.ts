import type { Problem } from './core/problems.js';

/**
 * The configuration problems that exist right now and whether the user has looked at them.
 * A different list is new to the user, so it alerts again.
 */
export class ProblemState {
  private list: readonly Problem[] = [];
  private seen = false;

  get problems(): readonly Problem[] {
    return this.list;
  }
  get count(): number {
    return this.list.length;
  }
  /** Problems exist and the user has not opened the screen that lists them. */
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
