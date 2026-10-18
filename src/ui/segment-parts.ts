import { visibleWidth } from '@earendil-works/pi-tui';
import type { Variant } from '../core/looks.js';
import type { Snapshot } from '../core/model.js';
import { formatPercent, formatTokens, safeLabel } from '../core/model.js';
import type { Paint } from './palette.js';

/** Columns an item's icon takes, with the space or two that follow it before the text. */
export function iconSpan(id: string, icon: string): number {
  return visibleWidth(icon) + (id === 'changes' || id === 'ahead' ? 2 : 1);
}
export function paintIcon(p: Paint, text: string): string {
  return p(text, 'cyan');
}

/** `~/a/b/project` to `~/…/project`; short paths are left alone. */
function elide(path: string): string {
  const parts = path.split('/');
  return parts.length > 2 ? `${parts[0] ?? ''}/…/${parts.at(-1) ?? ''}` : path;
}
export function workspace(
  snapshot: Snapshot,
  p: Paint,
  rendering: { icon: string; variant: Variant },
): string {
  const path = safeLabel(snapshot.cwd);
  const home = path.startsWith(`${snapshot.home}/`) ? `~${path.slice(snapshot.home.length)}` : path;
  const shown = rendering.variant === 'short' ? elide(home) : home;
  const slash = rendering.variant === 'bare' ? shown.lastIndexOf('/') + 1 : 0;
  const split = shown.lastIndexOf('/') + 1;
  return (
    paintIcon(p, `${rendering.icon} `) +
    (rendering.variant === 'bare' ? '' : p(shown.slice(0, split), 'muted')) +
    p(shown.slice(Math.max(slash, split)))
  );
}
export function usage(snapshot: Snapshot, p: Paint, variant: Variant): string {
  const fill = Math.round((Math.min(100, Math.max(0, snapshot.percent ?? 0)) / 100) * 10);
  const bar = p('━'.repeat(fill), 'yellow') + p('━'.repeat(10 - fill), 'muted');
  if (variant === 'bare')
    return snapshot.percent === null
      ? p('pending', 'muted')
      : p(formatPercent(snapshot.percent), 'yellow', 'bold');
  const value =
    snapshot.percent === null
      ? p('context pending / ', 'muted') + p(formatTokens(snapshot.capacity))
      : p(formatPercent(snapshot.percent), 'yellow', 'bold') +
        p(' of ', 'muted') +
        p(formatTokens(snapshot.capacity));
  return variant === 'short' ? value : bar + p('  ') + value;
}
export function compaction(snapshot: Snapshot, unit: 'tokens' | 'percent' = 'tokens'): string {
  if (!snapshot.autoCompact) return 'auto compact off';
  if (unit === 'percent')
    return snapshot.compactAt === undefined || snapshot.compactAt === null
      ? 'awaiting usage'
      : `compacts at ${snapshot.compactAt}%`;
  return snapshot.compactRemaining === null
    ? 'awaiting usage'
    : `compacts in ${formatTokens(snapshot.compactRemaining)}`;
}
export function gitValue(
  value: number | null,
  p: Paint,
  options: { icon: string; kind: 'files' | 'ahead'; short: boolean },
): string {
  if (value === null) return '';
  const color = options.kind === 'files' ? 'yellow' : 'muted';
  const unit = options.kind === 'files' && value === 1 ? 'file' : options.kind;
  return (
    paintIcon(p, `${options.icon}  `) +
    p(`${value}`, color) +
    (options.short ? '' : p(` ${unit}`, color))
  );
}
export function gitBranch(snapshot: Snapshot, p: Paint, icon: string): string {
  if (snapshot.git.monitoring === 'unavailable') return p('Git unavailable', 'muted');
  return snapshot.git.branch === null
    ? ''
    : paintIcon(p, `${icon} `) + p(safeLabel(snapshot.git.branch), 'text');
}
