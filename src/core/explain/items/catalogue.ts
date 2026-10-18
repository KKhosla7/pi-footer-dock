import { QUOTA_TOGGLE } from '../../footer-config.js';
import { formatTokens, safeLabel } from '../../model.js';
import type { Snapshot } from '../../model.js';
import type { Fact } from '../blocks.js';
import type { Explainer } from '../explainer.js';
import { simpleExplainer } from '../simple.js';

const label = (text: string): string => safeLabel(text).slice(0, 120);
const gitMissing = (snapshot: Snapshot): string =>
  snapshot.git.monitoring === 'unavailable'
    ? 'the repository is too large to watch completely, so the count is unknown'
    : 'not a Git repository, or Git could not be read';

/** Said on the Git items when the repository is too large to watch: values refresh after each Pi action. */
const refreshFacts = (snapshot: Snapshot): Fact[] =>
  snapshot.git.monitoring === 'events'
    ? [
        {
          label: 'Refreshed',
          value: 'after each Pi action',
          note: 'too large to watch, so edits made outside Pi show at the next action',
        },
      ]
    : [];

/** Items that are a value and a few facts. Each row states what it reports and when it is missing. */
export const catalogue: readonly Explainer[] = [
  simpleExplainer({
    id: 'workspace',
    title: 'Project folder',
    reports: [
      "The session's working directory, with your home folder written as ~.",
      'Shortened in the middle when the footer is tight; the icon opens it in your file manager.',
    ],
    missingWhen: [
      'Never: it is always known. A folder deleted since the session began still shows.',
    ],
    facts: ({ snapshot }) => [{ label: 'Path', value: label(snapshot.cwd) }],
  }),
  simpleExplainer({
    id: 'branch',
    title: 'Git branch',
    reports: ['The branch Git has checked out, read from `git status` without changing anything.'],
    missingWhen: [
      'The folder is not a Git repository, or Git is not installed.',
      'Git took longer than five seconds to answer.',
      'On a detached head it shows (detached) rather than a name.',
    ],
    facts: ({ snapshot }) => refreshFacts(snapshot),
    missing: ({ snapshot }) =>
      snapshot.git.branch === null ? 'not a Git repository, or Git could not be read' : undefined,
  }),
  simpleExplainer({
    id: 'changes',
    title: 'Changed files',
    reports: [
      'How many files differ from the last commit: changed, new or deleted, including untracked files that are not ignored.',
      'A file changed both staged and unstaged counts once. It counts files, not lines.',
    ],
    missingWhen: [
      'Not a Git repository, or Git could not be read.',
      'The repository is too large to watch completely: the count is then unknown, never a clean zero.',
    ],
    facts: ({ snapshot }) => refreshFacts(snapshot),
    missing: ({ snapshot }) => (snapshot.git.changed === null ? gitMissing(snapshot) : undefined),
  }),
  simpleExplainer({
    id: 'ahead',
    title: 'Commits ahead',
    reports: [
      'Commits on this branch that are not on the upstream branch Git has on record.',
      'Uncommitted files do not count. Nothing is fetched from the network, so it is as current as your last fetch.',
    ],
    missingWhen: [
      'The branch has no upstream configured: unknown, not zero.',
      'A detached head, or not a Git repository.',
    ],
    facts: ({ snapshot }) => refreshFacts(snapshot),
    missing: ({ snapshot }) =>
      snapshot.git.ahead === null
        ? 'no upstream branch is recorded, or not a Git repository'
        : undefined,
  }),
  simpleExplainer({
    id: 'model',
    title: 'Model',
    reports: [
      'The provider and model Pi uses for the next response.',
      'The provider name does not say whether you signed in with an API key or an account.',
    ],
    missingWhen: ['No model is selected (the footer says no model).'],
    facts: ({ snapshot }) => [
      { label: 'Provider', value: label(snapshot.provider) },
      { label: 'Model', value: label(snapshot.model) },
    ],
    missing: ({ snapshot }) => (snapshot.model === 'no model' ? 'no model is selected' : undefined),
  }),
  simpleExplainer({
    id: 'thinking',
    title: 'Thinking level',
    reports: ["Pi's reasoning effort for the model, for example low, medium or high."],
    missingWhen: ['The model has no thinking levels, so nothing is shown.'],
    missing: ({ snapshot }) =>
      snapshot.thinking === null ? 'this model has no thinking levels' : undefined,
  }),
  simpleExplainer({
    id: 'input',
    title: 'Input tokens',
    reports: [
      'Tokens sent to the model, added up over every recorded response of this session, other branches included.',
      'This is not the size of the current context; see Context usage for that.',
    ],
    missingWhen: [
      'A recorded response has invalid or conflicting usage: the total is then unknown rather than guessed.',
      'The provider reports no usage.',
    ],
    facts: ({ snapshot }) => [
      { label: 'Tokens', value: formatTokens(snapshot.totals.input, 'decimal') },
    ],
    missing: ({ snapshot }) =>
      snapshot.totals.input === null ? 'a recorded response had unusable usage' : undefined,
  }),
  simpleExplainer({
    id: 'output',
    title: 'Output tokens',
    reports: [
      'Tokens the model wrote, added up over every recorded response of this session. Reasoning tokens are included when the provider counts them as output.',
    ],
    missingWhen: [
      'A recorded response has invalid or conflicting usage: the total is then unknown rather than guessed.',
      'The provider reports no usage.',
    ],
    facts: ({ snapshot }) => [
      { label: 'Tokens', value: formatTokens(snapshot.totals.output, 'decimal') },
    ],
    missing: ({ snapshot }) =>
      snapshot.totals.output === null ? 'a recorded response had unusable usage' : undefined,
  }),
  simpleExplainer({
    id: 'context',
    title: 'Context icon',
    reports: ['An icon before the context figures. It is only a marker; the figures follow it.'],
    missingWhen: ['Hidden in settings, or when the footer is too narrow for it.'],
  }),
  simpleExplainer({
    id: QUOTA_TOGGLE,
    title: 'Show other limit windows',
    reports: [
      'A button after the limit usage: › shows the windows that are collapsed, ‹ collapses them again.',
      'Keyboard: /dock-quota.',
    ],
    missingWhen: [
      'There are fewer than two limit windows, so nothing is collapsed.',
      'The footer is wide enough to show every window, or the limit usage is hidden in settings.',
    ],
  }),
];
