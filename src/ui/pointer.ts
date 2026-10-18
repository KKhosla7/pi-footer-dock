import type { TuiMouseEvent } from '@earendil-works/pi-tui';
import type { HitRegion } from './layout.js';

/** Shared normalized gesture policy, independent of slot names and action IDs. */
export function pointerRejection(event: TuiMouseEvent): string | undefined {
  if (event.type !== 'click' && event.type !== 'press') return 'non-activation-event';
  if (event.button !== 'left') return 'non-primary-button';
  if (event.shift || event.alt || event.ctrl) return 'modified-event';
  return undefined;
}
export function hitRegion(
  event: TuiMouseEvent,
  regions: readonly HitRegion[],
): HitRegion | undefined {
  return regions.find(
    (region) =>
      event.x >= region.x &&
      event.x < region.x + region.width &&
      event.y >= region.y &&
      event.y < region.y + region.height,
  );
}
