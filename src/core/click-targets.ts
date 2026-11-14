const ICON_SUFFIX = ':icon';

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
