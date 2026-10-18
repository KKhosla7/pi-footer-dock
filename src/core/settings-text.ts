/** What the menu says about each item: a name and one short line, so every row reads alike. */
export const itemText = new Map<string, { label: string; note: string }>([
  ['workspace', { label: 'Project folder', note: 'The project folder, shortened when tight.' }],
  ['branch', { label: 'Git branch', note: 'The current Git branch.' }],
  ['changes', { label: 'Changed files', note: 'Files with uncommitted changes.' }],
  ['ahead', { label: 'Commits ahead', note: 'Commits not pushed yet.' }],
  ['model', { label: 'Model', note: 'The model, with its provider when there is room.' }],
  ['thinking', { label: 'Thinking level', note: "The model's thinking level." }],
  ['context', { label: 'Context icon', note: 'Icon before context usage; click for its action.' }],
  ['context-usage', { label: 'Context usage', note: 'How much of the context window is used.' }],
  ['compaction', { label: 'Compaction notice', note: 'Notice before the context is compacted.' }],
  ['input', { label: 'Input tokens', note: 'Input tokens used in this session.' }],
  ['output', { label: 'Output tokens', note: 'Output tokens used in this session.' }],
  ['cache', { label: 'Cache', note: 'Share of the prompt served from the cache.' }],
  ['speed', { label: 'Tokens per second', note: 'Output speed of the last response.' }],
  ['quota', { label: 'Limit usage', note: 'What is left of each provider limit.' }],
  ['cost', { label: 'Cost', note: 'Estimated spend at API prices.' }],
]);

export const costText = {
  period: 'Spend over a day, a week, a month, or this session.',
} as const;

export const compactionText = 'How it is shown; click it for the table.';

export const quotaText = {
  window: (label: string) => `Show or hide the ${label} window.`,
  network: 'Ask your provider for its limits. Off sends nothing.',
  wording: 'Percent left, or percent used.',
  collapse: 'When to collapse, and which windows stay.',
  collapsedWindow: (label: string) => `Keep ${label} visible when collapsed.`,
  expanded: 'Start with every limit window shown.',
  animation: 'Let the limit meter animate.',
  meter: 'Lavender, or your Pi theme colour.',
  glyphs: 'Nerd Font icons, or portable symbols.',
} as const;
