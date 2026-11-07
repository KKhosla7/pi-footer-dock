import { QUOTA_TOGGLE, slotOptions } from '../core/footer-config.js';
import type { FooterConfig, SlotOptions } from '../core/footer-config.js';
import { attachedTo, preferredGaps } from '../core/looks.js';

/** Columns before an item that follows another one: the user's `gap`, else the slot's own preference. */
export function segmentGap(config: FooterConfig, id: string): number {
  return slotOptions(config, id).gap ?? preferredGaps.get(id) ?? 3;
}
/** For the second half of a two-slot item: who it attaches to, and its gap when it directly follows. */
export function attachment(
  id: string,
  slot: SlotOptions,
): { attach?: { to: string; gap: number } } {
  const to = attachedTo.get(id);
  return to ? { attach: { to, gap: slot.gap ?? 0 } } : {};
}
/** The item whose wording an item follows: the chevron follows the quota; every other item follows itself. */
export function leaderOf(id: string): string {
  return id === QUOTA_TOGGLE ? (attachedTo.get(id) ?? id) : id;
}
