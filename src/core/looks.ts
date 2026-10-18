/**
 * Five ordered looks, richest to most compact. A look is not tied to a number of columns: each row
 * uses the richest look that fits (five looks, xl to xs).
 */
export const LOOKS = ['xl', 'lg', 'md', 'sm', 'xs'] as const;
export type Look = (typeof LOOKS)[number];
/** What an item shows at a look: everything, a shorter form, the bare value, or nothing. */
export type Variant = 'full' | 'short' | 'bare' | 'hide';
type Table = Partial<Record<Look, Variant>>;

export function isLook(value: unknown): value is Look {
  return LOOKS.some((look) => look === value);
}
export function lookIndex(look: Look): number {
  return LOOKS.indexOf(look);
}

/**
 * Per-look forms of the stock items. A look that is not listed inherits the nearest richer one,
 * like desktop-first CSS, so only the looks where an item changes are written down.
 */
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

export function variantAt(table: Table | undefined, look: Look, hideAt?: Look): Variant {
  if (hideAt !== undefined && lookIndex(look) >= lookIndex(hideAt)) return 'hide';
  for (let index = lookIndex(look); index >= 0; index -= 1) {
    const look_ = LOOKS[index];
    const variant = look_ === undefined ? undefined : table?.[look_];
    if (variant !== undefined) return variant;
  }
  return 'full';
}

/** The richest look whose rendering fits, or undefined if none does. */
export function richestFit<T>(
  render: (look: Look) => T,
  fits: (value: T) => boolean,
): { look: Look; value: T } | undefined {
  for (const look of LOOKS) {
    const value = render(look);
    if (fits(value)) return { look, value };
  }
  return undefined;
}

/** Essentials, least important first; the project name is the last survivor. */
const ESSENTIALS = [
  'compaction',
  'quota-more',
  'context-usage',
  'context',
  'quota',
  'thinking',
  'model',
  'branch',
  'workspace',
] as const;
/**
 * Items to remove, in order, when a row does not fit even at the narrowest look: anything that is
 * not an essential first (last in reading order first), then the essentials as listed.
 */
export function removalOrder(ids: readonly string[]): string[] {
  const essential = new Set<string>(ESSENTIALS);
  const others = ids.filter((id) => !essential.has(id)).reverse();
  return [...others, ...ESSENTIALS.filter((id) => ids.includes(id))];
}
