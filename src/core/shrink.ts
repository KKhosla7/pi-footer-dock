import { closest } from './problems.js';

export interface RowState {
  level: ReadonlyMap<string, number>;
  dropped: ReadonlySet<string>;
}
export interface RowModel {
  ids: readonly string[];
  depth(id: string): number;
  fits(state: RowState): boolean;
}

const repeat = (step: string, times: number): string[] => Array.from({ length: times }, () => step);
const LEAST_IMPORTANT: readonly string[] = [
  'drop:cost',
  'drop:compaction',
  'shorten:cache',
  'drop:cache',
  'shorten:input',
  'shorten:output',
  'drop:input',
  'drop:output',
];
const QUOTA_WORDING = 'shorten:quota';
const REST: readonly string[] = [
  ...repeat('shorten:quota', 3),
  'drop:speed',
  ...repeat('shorten:context-usage', 2),
  'shorten:changes',
  'shorten:ahead',
  ...repeat('shorten:workspace', 2),
  'shorten:model',
  'drop:ahead',
  'drop:changes',
  'drop:context-usage',
  'drop:context',
  'drop:quota-more',
  'drop:quota',
  'drop:thinking',
  'drop:model',
  'drop:branch',
];
export const DEFAULT_PLAN: readonly string[] = [QUOTA_WORDING, ...LEAST_IMPORTANT, ...REST];

export function planWithExtensions(
  ids: readonly string[],
  depth: (id: string) => number,
): readonly string[] {
  const steps = [...ids]
    .reverse()
    .flatMap((id) => [...repeat(`shorten:${id}`, depth(id)), `drop:${id}`]);
  return [QUOTA_WORDING, ...LEAST_IMPORTANT, ...steps, ...REST];
}

export const STEP_NAMES: ReadonlySet<string> = new Set(DEFAULT_PLAN);
export const REST_MARK = '...';
const MAX_SHRINK = 64;

function checkStep(item: unknown, owed: Map<string, number>): void {
  if (typeof item !== 'string') throw new Error('shrink steps must be text');
  if (!STEP_NAMES.has(item)) {
    const near = closest(item, STEP_NAMES);
    throw new Error(
      `Unknown shrink step: ${item.slice(0, 40)}${near ? ` (did you mean ${near}?)` : ''}`,
    );
  }
  const left = (owed.get(item) ?? 0) - 1;
  if (left < 0) throw new Error(`Shrink step used more often than the plan has it: ${item}`);
  owed.set(item, left);
}

export function parseShrink(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > MAX_SHRINK)
    throw new Error(`shrink must be a list of at most ${MAX_SHRINK} steps`);
  const owed = new Map<string, number>();
  for (const step of DEFAULT_PLAN) owed.set(step, (owed.get(step) ?? 0) + 1);
  const marks = (value as unknown[]).filter((item) => item === REST_MARK).length;
  if (marks > 1) throw new Error(`shrink may hold "${REST_MARK}" once`);
  for (const item of value as unknown[]) if (item !== REST_MARK) checkStep(item, owed);
  return value as string[];
}

export function orderPlan(
  base: readonly string[],
  user: readonly string[] | undefined,
): readonly string[] {
  if (!user || user.length === 0) return base;
  const owed = new Map<string, number>();
  for (const step of user) if (step !== REST_MARK) owed.set(step, (owed.get(step) ?? 0) + 1);
  const rest = base.filter((step) => {
    const left = owed.get(step) ?? 0;
    if (left > 0) owed.set(step, left - 1);
    return left === 0;
  });
  const mark = user.indexOf(REST_MARK);
  if (mark < 0) return [...user, ...rest];
  return [...user.slice(0, mark), ...rest, ...user.slice(mark + 1)];
}

interface Working {
  level: Map<string, number>;
  dropped: Set<string>;
}
function take(step: string, model: RowModel, state: Working): boolean {
  const colon = step.indexOf(':');
  const kind = step.slice(0, colon);
  const id = step.slice(colon + 1);
  if (!model.ids.includes(id) || state.dropped.has(id)) return false;
  if (kind === 'drop') {
    state.dropped.add(id);
    return true;
  }
  const level = state.level.get(id) ?? 0;
  if (kind !== 'shorten' || level >= model.depth(id)) return false;
  state.level.set(id, level + 1);
  return true;
}

export function shrinkRow(
  model: RowModel,
  plan: readonly string[],
): RowState & { steps: string[] } {
  const state: Working = { level: new Map(), dropped: new Set() };
  const steps: string[] = [];
  let fitting = model.fits(state);
  for (const step of plan) {
    if (fitting) break;
    if (!take(step, model, state)) continue;
    steps.push(step);
    fitting = model.fits(state);
  }
  return { ...state, steps };
}
