import { QUOTA_TOGGLE, slotOptions } from '../core/footer-config.js';
import type { FooterConfig, SlotOptions } from '../core/footer-config.js';
import { attachedTo, preferredGaps } from '../core/looks.js';

export function segmentGap(config: FooterConfig, id: string): number {
  return slotOptions(config, id).gap ?? preferredGaps.get(id) ?? 3;
}
export function attachment(
  id: string,
  slot: SlotOptions,
): { attach?: { to: string; gap: number } } {
  const to = attachedTo.get(id);
  return to ? { attach: { to, gap: slot.gap ?? 0 } } : {};
}
export function leaderOf(id: string): string {
  return id === QUOTA_TOGGLE ? (attachedTo.get(id) ?? id) : id;
}
