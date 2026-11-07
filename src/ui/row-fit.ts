import { visibleWidth } from '@earendil-works/pi-tui';
import type { Snapshot } from '../core/model.js';
import { QUOTA_TOGGLE, slotOptions } from '../core/footer-config.js';
import type { FooterConfig, FooterRow, SlotOptions } from '../core/footer-config.js';
import { LOOKS, lookIndex } from '../core/looks.js';
import type { Look } from '../core/looks.js';
import { orderPlan, planWithExtensions, shrinkRow } from '../core/shrink.js';
import type { RowState } from '../core/shrink.js';
import type { RenderOptions } from './render-options.js';
import { leaderOf } from './segment-gaps.js';
import { renderSegment } from './segments.js';
import type { Segment } from './segments.js';

export interface Group {
  text: string;
  spans: { segment: Segment; x: number }[];
}
export interface Placed {
  left: Group;
  right: Group;
}
export function join(segments: Segment[]): Group {
  let text = '';
  let previous: string | undefined;
  const spans: Group['spans'] = [];
  for (const segment of segments) {
    if (!segment.text) continue;
    // The second half of a two-slot item sits against the first only when it directly follows it.
    const attached = segment.attach !== undefined && segment.attach.to === previous;
    text += ' '.repeat(text ? (attached ? (segment.attach?.gap ?? 0) : segment.gap) : 0);
    spans.push({ segment, x: visibleWidth(text) });
    text += segment.text;
    previous = segment.id;
  }
  return { text, spans };
}
export const rowWidth = (placed: Placed): number =>
  visibleWidth(placed.left.text) + (placed.right.text ? 2 + visibleWidth(placed.right.text) : 0);

export interface FitContext {
  snapshot: Snapshot;
  options: RenderOptions;
  config: FooterConfig;
  available: number;
}
/** The user's `hideAt` for an item (the chevron follows the quota), if any. */
const hideAtOf = (config: FooterConfig, id: string): Look | undefined =>
  slotOptions(config, leaderOf(id)).hideAt;

/** The configuration without `hideAt`: the shrink plan, not the item's own look, decides when it gives way. */
export function withoutHideAt(config: FooterConfig): FooterConfig {
  const slots = Object.entries(config.slots).map(([id, slot]) => [
    id,
    Object.fromEntries(Object.entries(slot).filter(([key]) => key !== 'hideAt')) as SlotOptions,
  ]);
  return { ...config, slots: Object.fromEntries(slots) as FooterConfig['slots'] };
}

/**
 * "Hidden from <look>" keeps its meaning: an item with `hideAt` is dropped once the row would
 * have needed that look, found as before: the richest look at which every item at that one look
 * fits. Only rows that have such an item pay for the measurement.
 */
function hiddenByLook(row: FooterRow, ctx: FitContext): Set<string> {
  const ids = [...row.left, ...row.right];
  const limits = ids.flatMap((id) => {
    const at = hideAtOf(ctx.config, id);
    return at ? [{ id, at }] : [];
  });
  if (limits.length === 0) return new Set();
  const at = (look: Look): Placed => {
    const render = (list: string[]) =>
      join(
        list.map((id) =>
          renderSegment(id, ctx.snapshot, ctx.options, { config: ctx.config, look }),
        ),
      );
    return { left: render(row.left), right: render(row.right) };
  };
  const needed = LOOKS.find((look) => rowWidth(at(look)) <= ctx.available) ?? 'xs';
  return new Set(
    limits.filter(({ at: limit }) => lookIndex(needed) >= lookIndex(limit)).map(({ id }) => id),
  );
}

/**
 * One row at the least shortening that fits: each item has its own wordings (what it prints at
 * each look, without repeats), and the shrink plan takes them away one step at a time.
 * `plain` is the configuration without `hideAt`.
 */
export function fitRow(row: FooterRow, ctx: FitContext, plain: FooterConfig): Placed {
  const memo = new Map<string, Segment>();
  const segment = (id: string, look: Look, expanded: boolean): Segment => {
    const key = `${id}|${look}|${expanded}`;
    const known = memo.get(key);
    if (known) return known;
    const options = { ...ctx.options, quotaExpanded: expanded };
    const made = renderSegment(id, ctx.snapshot, options, { config: plain, look });
    memo.set(key, made);
    return made;
  };
  const wordings = new Map<string, Look[]>();
  const wordingsOf = (id: string): Look[] => {
    const known = wordings.get(id);
    if (known) return known;
    // The chevron belongs to the quota: one wording of its own, present if it shows at any look.
    if (id === QUOTA_TOGGLE) {
      const shows = LOOKS.some(
        (look) => segment(id, look, ctx.options.quotaExpanded === true).text,
      );
      wordings.set(id, shows ? ['xl'] : []);
      return wordings.get(id) ?? [];
    }
    const looks: Look[] = [];
    let last = '';
    for (const look of LOOKS) {
      const { text } = segment(id, look, ctx.options.quotaExpanded === true);
      if (!text) break;
      if (text !== last) looks.push(look);
      last = text;
    }
    wordings.set(id, looks);
    return looks;
  };
  const hidden = hiddenByLook(row, ctx);
  const ids = [...row.left, ...row.right].filter(
    (id) => !hidden.has(id) && wordingsOf(id).length > 0,
  );
  const present = new Set(ids);
  const lookOf = (id: string, state: RowState): Look => {
    const leader = leaderOf(id);
    return wordingsOf(leader)[state.level.get(leader) ?? 0] ?? 'xs';
  };
  const render = (state: RowState): Placed => {
    const expanded = ctx.options.quotaExpanded === true && !state.dropped.has(QUOTA_TOGGLE);
    const side = (list: string[]) =>
      join(
        list
          .filter((id) => present.has(id) && !state.dropped.has(id))
          .map((id) => segment(id, lookOf(id, state), expanded)),
      );
    return { left: side(row.left), right: side(row.right) };
  };
  const depth = (id: string): number => Math.max(0, wordingsOf(id).length - 1);
  const own = ids.filter((id) => ctx.options.extensions?.find(id));
  const plan = orderPlan(planWithExtensions(own, depth), ctx.config.shrink);
  const model = { ids, depth, fits: (state: RowState) => rowWidth(render(state)) <= ctx.available };
  return render(shrinkRow(model, plan));
}
