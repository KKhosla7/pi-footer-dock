import { stripTerminalSequences, truncateToWidth, visibleWidth } from '@earendil-works/pi-tui';
import type { Snapshot } from '../core/model.js';
import { iconTarget } from '../core/click-targets.js';
import { withExtensionRows } from '../core/ext/rows.js';
import { PROBLEM_MARKER, clickMode, defaultFooterConfig } from '../core/footer-config.js';
import type { FooterConfig } from '../core/footer-config.js';
import { withoutWindows } from '../core/quota-visibility.js';
import { fitRow, withoutHideAt } from './row-fit.js';
import type { Group } from './row-fit.js';
import type { RenderOptions } from './render-options.js';
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
function withProblemMarker(
  config: FooterConfig,
  problems: RenderOptions['problems'],
): FooterConfig {
  const [first, ...rest] = config.rows;
  if (!problems || problems.count === 0 || !first) return config;
  return { ...config, rows: [{ ...first, left: [PROBLEM_MARKER, ...first.left] }, ...rest] };
}

export function panelLine(content: string, width: number, paint: Paint): string {
  const clipped = truncateToWidth(content, Math.max(0, width), '', false);
  return clipped + paint(' '.repeat(Math.max(0, width - visibleWidth(clipped))));
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
    if (icon > 0 && icon < width) {
      result.push({ ...at, target: iconTarget(segment.id), width: icon });
      result.push({ ...at, target: segment.id, x: at.x + icon, width: width - icon });
    } else result.push({ ...at, target: segment.id, width });
  }
  return result;
}

export function layoutFooter(
  fullSnapshot: Snapshot,
  width: number,
  options: LayoutOptions,
): FooterLayout {
  const available = Math.max(0, Math.floor(width));
  const config = withProblemMarker(
    withExtensionRows(options.config ?? defaultFooterConfig(), options.extensions),
    options.problems,
  );
  const snapshot = withoutWindows(fullSnapshot, config.slots.quota?.hideWindows);
  const ctx = { snapshot, options, config, available };
  const plain = withoutHideAt(config);
  const rows = config.rows.map((row) => fitRow(row, ctx, plain));
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
