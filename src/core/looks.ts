export const LOOKS = ['xl', 'lg', 'md', 'sm', 'xs'] as const;
export type Look = (typeof LOOKS)[number];
export type Variant = 'full' | 'short' | 'bare' | 'hide';
type Table = Partial<Record<Look, Variant>>;

export function isLook(value: unknown): value is Look {
  return LOOKS.some((look) => look === value);
}
export function lookIndex(look: Look): number {
  return LOOKS.indexOf(look);
}

export const stockForms: ReadonlyMap<string, Table> = new Map<string, Table>([
  ['workspace', { xl: 'full', md: 'short', sm: 'bare' }],
  ['branch', { xl: 'full' }],
  ['changes', { xl: 'full', lg: 'short', sm: 'hide' }],
  ['ahead', { xl: 'full', lg: 'short', sm: 'hide' }],
  ['model', { xl: 'full', md: 'short' }],
  ['thinking', { xl: 'full' }],
  ['context', { xl: 'full' }],
  ['context-usage', { xl: 'full', sm: 'short', xs: 'bare' }],
  ['compaction', { xl: 'full', md: 'hide' }],
  ['input', { xl: 'full', sm: 'hide' }],
  ['output', { xl: 'full', sm: 'hide' }],
  ['cache', { xl: 'full', lg: 'short', md: 'hide' }],
  ['speed', { xl: 'full', xs: 'hide' }],
  ['cost', { xl: 'full', xs: 'hide' }],
  ['quota-more', { xl: 'full' }],
]);

export const layerNames: ReadonlyMap<string, readonly string[]> = new Map([
  ['model', ['provider', 'name']],
  ['quota', ['meter', 'reset']],
]);

export const preferredGaps: ReadonlyMap<string, number> = new Map([
  ['branch', 3],
  ['changes', 3],
  ['ahead', 3],
  ['thinking', 2],
  ['compaction', 2],
  ['input', 5],
  ['output', 3],
  ['cache', 3],
  ['speed', 3],
  ['cost', 3],
]);
export const attachedTo: ReadonlyMap<string, string> = new Map([
  ['context-usage', 'context'],
  ['quota-more', 'quota'],
]);

export function variantAt(table: Table | undefined, look: Look, hideAt?: Look): Variant {
  if (hideAt !== undefined && lookIndex(look) >= lookIndex(hideAt)) return 'hide';
  for (let index = lookIndex(look); index >= 0; index -= 1) {
    const look_ = LOOKS[index];
    const variant = look_ === undefined ? undefined : table?.[look_];
    if (variant !== undefined) return variant;
  }
  return 'full';
}
