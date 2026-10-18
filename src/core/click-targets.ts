/**
 * Click targets are tokens of an item: its text is the item's own id (`workspace`), its icon is
 * `<id>:icon`. Each token can have its own action; a token without one explains the item.
 */
const ICON_SUFFIX = ':icon';

/** Items whose icon does something when clicked. Their text still explains. */
export const ICON_ACTION_IDS: ReadonlySet<string> = new Set([
  'workspace',
  'model',
  'thinking',
  'branch',
  'changes',
  'ahead',
]);

export const iconTarget = (id: string): string => `${id}${ICON_SUFFIX}`;
export function parseTarget(target: string): { id: string; icon: boolean } {
  return target.endsWith(ICON_SUFFIX)
    ? { id: target.slice(0, -ICON_SUFFIX.length), icon: true }
    : { id: target, icon: false };
}
