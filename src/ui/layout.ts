import { stripTerminalSequences, truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import type { Snapshot } from '../core/model.js';
import { iconTarget } from '../core/click-targets.js';
import { withExtensionRows } from '../core/ext/rows.js';
import { QUOTA_TOGGLE, clickMode, defaultFooterConfig } from '../core/footer-config.js';
import type { FooterConfig } from '../core/footer-config.js';
import { removalOrder, richestFit } from '../core/looks.js';
import { withoutWindows } from '../core/quota-visibility.js';
import type { Look } from '../core/looks.js';
import { renderSegment } from './segments.js';
import type { RenderOptions } from './render-options.js';
import type { Segment } from './segments.js';
import type { Paint } from './palette.js';

export interface HitRegion {
  target: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface FooterLayout {
  lines: string[];
  hitRegions: HitRegion[];
}
export interface LayoutOptions extends RenderOptions {
  config?: FooterConfig;
}
interface Group {
  text: string;
  spans: { segment: Segment; x: number }[];
}

export function panelLine(content: string, width: number, paint: Paint): string {
  const clipped = truncateToWidth(content, Math.max(0, width), '', false);
  return clipped + paint(' '.repeat(Math.max(0, width - visibleWidth(clipped))));
}
function join(segments: Segment[]): Group {
  let text = '';
  const spans: Group['spans'] = [];
  for (const segment of segments) {
    if (!segment.text) continue;
    text += ' '.repeat(text ? segment.gap : 0);
    spans.push({ segment, x: visibleWidth(text) });
    text += segment.text;
  }
  return { text, spans };
}
interface Placed {
  left: Group;
  right: Group;
}
function group(
  ids: string[],
  snapshot: Snapshot,
  options: RenderOptions,
  settings: { config: FooterConfig; look: Look },
): Group {
  return join(ids.map((id) => renderSegment(id, snapshot, options, settings)));
}
const rowWidth = (placed: Placed): number =>
  visibleWidth(placed.left.text) + (placed.right.text ? 2 + visibleWidth(placed.right.text) : 0);

/**
 * Every row uses the richest look at which it fits. If a row does not fit even at the narrowest
 * look, items are removed in the essentials order (project name last), but only items of rows that
 * do not fit: removing from a row that already fits frees nothing for the one that does not.
 */
function chooseRows(
  config: FooterConfig,
  render: (row: number, look: Look, removed: ReadonlySet<string>) => Placed,
  available: number,
): Placed[] {
  const fits = (placed: Placed) => rowWidth(placed) <= available;
  const rowIds = config.rows.map((row) => [...row.left, ...row.right]);
  const order = removalOrder(rowIds.flat());
  const removed = new Set<string>();
  for (let step = 0; step <= order.length; step += 1) {
    const rows = rowIds.map((_, index) => richestFit((look) => render(index, look, removed), fits));
    const chosen = rows.flatMap((row) => (row ? [row.value] : []));
    if (chosen.length === rows.length) return chosen;
    const failing = rowIds.filter((_, index) => !rows[index]);
    // The project name is never removed: if it alone does not fit it is cut with an ellipsis.
    const next = order.find(
      (id) => id !== 'workspace' && !removed.has(id) && failing.some((ids) => ids.includes(id)),
    );
    if (next === undefined) break;
    removed.add(next);
  }
  return rowIds.map((_, index) => render(index, 'xs', removed));
}
function regions(
  group: Group,
  bounds: { x: number; y: number; width: number },
  config: FooterConfig,
): HitRegion[] {
  const result: HitRegion[] = [];
  for (const { segment, x } of group.spans) {
    if (clickMode(config, segment.id) === 'none') continue;
    const clipped = truncateToWidth(segment.text, Math.max(0, bounds.width - x), '', false);
    if (!stripTerminalSequences(clipped).trim()) continue;
    const width = visibleWidth(clipped);
    const icon = Math.min(segment.iconWidth, width);
    const at = { x: bounds.x + x, y: bounds.y, height: 1 };
    // The icon and the text are separate click targets: the icon may act, the text explains.
    if (icon > 0 && icon < width) {
      result.push({ ...at, target: iconTarget(segment.id), width: icon });
      result.push({ ...at, target: segment.id, x: at.x + icon, width: width - icon });
    } else result.push({ ...at, target: segment.id, width });
  }
  return result;
}

/** One renderer/geometry pipeline for stock and user-declared semantic slots. */
export function layoutFooter(
  fullSnapshot: Snapshot,
  width: number,
  options: LayoutOptions,
): FooterLayout {
  const available = Math.max(0, Math.floor(width));
  const config = withExtensionRows(options.config ?? defaultFooterConfig(), options.extensions);
  const snapshot = withoutWindows(fullSnapshot, config.slots.quota?.hideWindows);
  const rows = chooseRows(
    config,
    (index, look, removed) => {
      const row = config.rows[index];
      const keep = (ids: string[] | undefined) => (ids ?? []).filter((id) => !removed.has(id));
      // Once the chevron has to go, the quota is collapsed again: the layout wins over the expand state.
      const shown = {
        ...options,
        quotaExpanded: options.quotaExpanded === true && !removed.has(QUOTA_TOGGLE),
      };
      return {
        left: group(keep(row?.left), snapshot, shown, { config, look }),
        right: group(keep(row?.right), snapshot, shown, { config, look }),
      };
    },
    available,
  );
  const hitRegions: HitRegion[] = [];
  const lines = rows.map((row, y) => {
    const column = available - visibleWidth(row.right.text);
    const leftWidth = row.right.text ? Math.max(0, column - 2) : available;
    const left = truncateToWidth(row.left.text, leftWidth, '…', false);
    hitRegions.push(...regions(row.left, { x: 0, y, width: leftWidth }, config));
    if (!row.right.text) return panelLine(left, available, options.paint);
    hitRegions.push(
      ...regions(row.right, { x: column, y, width: Math.max(0, available - column) }, config),
    );
    return panelLine(
      left + options.paint(' '.repeat(Math.max(2, column - visibleWidth(left)))) + row.right.text,
      available,
      options.paint,
    );
  });
  return { lines, hitRegions };
}
