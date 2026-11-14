import { METER_STYLES, meterSample } from './meter-styles.js';
import { row, withNote } from './menu-row.js';
import type { MenuRow } from './menu-row.js';

export interface Words {
  label: string;
  note: string;
}

export const groupText: Record<string, Words> = {
  workspace: { label: 'Project and Git', note: 'Folder, branch, changed files, commits ahead.' },
  model: { label: 'Model', note: 'The model and its thinking level.' },
  context: { label: 'Context and tokens', note: 'Context, compaction notice, input and output.' },
  usage: { label: 'Cache, speed and cost', note: 'Cache, speed and estimated cost.' },
  quota: { label: 'Limit usage', note: 'Visibility, windows, collapse, left or used.' },
  collapse: { label: 'Collapse windows', note: 'When to collapse, and which windows stay.' },
  appearance: { label: 'Appearance', note: 'Icons, bold icons and every colour of the footer.' },
  colors: { label: 'Colours', note: 'Every colour of the footer. Enter to choose one.' },
};

export const itemText = new Map<string, Words>([
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

export const layerText = new Map<string, Words>([
  ['model:provider', { label: 'Provider', note: 'The provider before the model name.' }],
  [
    'model:name',
    { label: 'Model name', note: 'The model name. With both off the item is hidden.' },
  ],
  ['quota:meter', { label: 'Meter', note: 'The bar before the percent.' }],
  ['quota:reset', { label: 'Reset time', note: 'The reload icon and the time until the reset.' }],
]);

const rowText: Record<string, Words> = {
  unit: { label: 'Compaction unit', note: 'Show the notice in tokens or in percent.' },
  period: { label: 'Cost period', note: 'Spend over a day, a week, a month, or this session.' },
  limits: {
    label: 'Ask providers for limits',
    note: 'Ask your provider for its limits. Off sends nothing.',
  },
  wording: { label: 'Percent shown', note: 'Show the percent left, or the percent used.' },
  collapse: { label: 'When to collapse', note: 'When to hide the last window behind ›.' },
  expanded: { label: 'Start expanded', note: 'Start with every limit window shown.' },
  animation: { label: 'Animate changes', note: 'Flash the meter briefly when a limit changes.' },
  clicks: {
    label: 'Clicking an item',
    note: 'Act: icons do things (open the folder, pick a model, switch branch). Explain: a click only explains the item.',
  },
  glyphs: {
    label: 'Icons',
    note: 'Automatic: Nerd Font icons, or plain symbols on a terminal that cannot show them. Plain symbols are ordinary characters every font has, and can be bold.',
  },
  meterStyle: {
    label: 'Meter look',
    note: 'Line and solid blocks are drawn by the terminal itself, so they look the same in any font.',
  },
  iconBold: { label: 'Bold icons', note: 'Draw the plain icons in bold.' },
  'color:accent': { label: 'Accent', note: 'Icons, the model name and the limit meter.' },
  'color:text': { label: 'Text', note: 'Names, numbers, the branch and token counts.' },
  'color:muted': { label: 'Labels', note: 'Labels, separators and empty meter cells.' },
  'color:highlight': {
    label: 'Highlight',
    note: 'The context bar, changed files and the compaction notice.',
  },
  'color:warning': {
    label: 'Warning',
    note: 'A limit at 25% or less. A status, so keep it distinct.',
  },
  'color:error': { label: 'Error', note: 'A blocked limit and the problems marker.' },
  'color:success': {
    label: 'Success',
    note: 'Used by other extensions; the footer itself shows none.',
  },
};

export const windowWords = (label: string): Words => ({
  label: `Window: ${label}`,
  note: `Show or hide the ${label} window.`,
});
export const keepWords = (label: string): Words => ({
  label: `Keep ${label}`,
  note: `Keep ${label} visible when collapsed.`,
});

const SHOWN_HIDDEN = { shown: 'shown', hidden: 'hidden' };
const VISIBILITY = {
  shown: 'shown',
  lg: 'hidden when the row is a bit tight',
  md: 'hidden when the row is tight',
  sm: 'hidden when the row is quite tight',
  xs: 'hidden when the row is very tight',
  hidden: 'hidden',
};
const STYLE_NAMES = { slanted: 'slanted', line: 'line', blocks: 'solid blocks' };
const OPTIONS: Record<string, Record<string, string>> = {
  unit: { tokens: 'tokens', percent: 'percent' },
  period: { day: 'day', week: 'week', month: 'month', session: 'session' },
  limits: { off: 'off', on: 'on' },
  wording: { left: 'left', used: 'used' },
  collapse: { tight: 'when tight', always: 'always' },
  expanded: { no: 'no', yes: 'yes' },
  animation: { on: 'on', off: 'off' },
  clicks: { actions: 'act', explain: 'explain' },
  glyphs: { auto: 'automatic', nerd: 'Nerd Font', portable: 'plain symbols' },
  iconBold: { on: 'on', off: 'off' },
  meterStyle: Object.fromEntries(
    METER_STYLES.map((style) => [style, `${STYLE_NAMES[style]} ${meterSample(style)}`]),
  ),
};
const COLOURS: Record<string, Record<string, string>> = {
  accent: { default: 'lavender, adapted to your theme', theme: 'theme accent' },
  text: { default: 'theme', terminal: 'terminal default' },
  muted: { default: 'theme', terminal: 'terminal default (faint)' },
  highlight: { default: 'theme (calm)', warning: 'warning colour (the old look)' },
  warning: { default: 'theme' },
  error: { default: 'theme' },
  success: { default: 'theme' },
};
export const colourNotes: Record<string, string> = {
  'accent:default': 'Keeps our lavender hue and takes its lightness from your theme and terminal.',
  'accent:theme': "The theme's own accent colour.",
  'text:terminal': "Your terminal's own default colour: always readable.",
  'muted:terminal': "Your terminal's own default colour, faint: always readable.",
  'highlight:warning': 'The warning colour, as the context bar was drawn before.',
};

const KEEP = { shown: 'yes', hidden: 'no' };
function choiceWords(id: string): Record<string, string> | undefined {
  if (id.startsWith('item:')) return VISIBILITY;
  if (id.startsWith('window:') || id.startsWith('layer:')) return SHOWN_HIDDEN;
  if (id.startsWith('collapsed:')) return KEEP;
  if (id.startsWith('color:')) return COLOURS[id.slice('color:'.length)];
  return OPTIONS[id];
}
export function wordFor(id: string, key: string, icons?: 'nerd' | 'portable'): string {
  if (id === 'glyphs' && key === 'auto' && icons)
    return `${OPTIONS.glyphs?.auto ?? key} (${OPTIONS.glyphs?.[icons] ?? icons})`;
  return choiceWords(id)?.[key] ?? key;
}
export function keyFor(id: string, word: string): string {
  if (id === 'glyphs' && word.startsWith(OPTIONS.glyphs?.auto ?? '')) return 'auto';
  const words = choiceWords(id);
  return Object.entries(words ?? {}).find(([, shown]) => shown === word)?.[0] ?? word;
}

export function textRow(id: string, current: string, values: readonly string[]): MenuRow {
  const words = rowText[id];
  if (!words) throw new Error(`No words for the settings row ${id}`);
  return withNote(row(id, words.label, current, [...values]), words.note);
}
export const rowLabel = (id: string): string => rowText[id]?.label ?? id;
export const fixedRowIds = (): string[] => Object.keys(rowText);
