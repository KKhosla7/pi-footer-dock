import { ProblemState } from '../../src/problem-state.js';
import type { ProblemsHost } from '../../src/problems-controller.js';

export const noProblems: ProblemsHost = {
  state: new ProblemState(),
  load: () => undefined,
  open: () => Promise.resolve(),
};
