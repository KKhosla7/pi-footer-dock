import { ProblemState } from '../../src/problem-state.js';
import type { ProblemsHost } from '../../src/problems-controller.js';

/** A problems host with nothing to report, for tests that build the interactions by hand. */
export const noProblems: ProblemsHost = {
  state: new ProblemState(),
  load: () => undefined,
  open: () => Promise.resolve(),
};
