import { HIDDEN, SHOWN, row, savable, withNote } from './menu-row.js';
import type { MenuRow } from './menu-row.js';
import type { Settings } from './settings.js';
import { withSlot } from './settings.js';
import { quotaText } from './settings-text.js';

const MAX_LABELS = 8;
const PREFIX = 'collapsed:';

/** The windows the user can see: what the provider publishes, minus the ones hidden for good. */
const visible = (settings: Settings, published: readonly string[]): string[] =>
  published.filter((label) => !(settings.slots.quota?.hideWindows ?? []).includes(label));
/** What stays when collapsed: the user's pick, or every window but the last. */
const kept = (settings: Settings, published: readonly string[]): string[] =>
  settings.slots.quota?.collapsedShow ?? visible(settings, published).slice(0, -1);

/** One row per visible window: does it stay when the quota is collapsed? */
export function collapsedRows(settings: Settings, published: readonly string[]): MenuRow[] {
  const stays = kept(settings, published);
  const all = visible(settings, published);
  return all.filter(savable).map((label) => ({
    ...withNote(
      row(
        `${PREFIX}${label}`,
        `Stays when collapsed: ${label}`,
        stays.includes(label) ? SHOWN : HIDDEN,
        [SHOWN, HIDDEN],
      ),
      quotaText.collapsedWindow(label),
    ),
    // Untouched, every window stays except the last.
    default: label === all.at(-1) ? HIDDEN : SHOWN,
  }));
}

export const isCollapsedRow = (id: string): boolean => id.startsWith(PREFIX);
export const collapsedLabel = (id: string): string => id.slice(PREFIX.length);

/** The settings after one window was set to stay (or not) when collapsed; the list is bounded. */
export function collapsedChoice(
  settings: Settings,
  label: string,
  value: string,
  published: readonly string[],
): Settings {
  const others = kept(settings, published).filter((item) => item !== label);
  const next = value === SHOWN ? [...others, label] : others;
  return next.length > MAX_LABELS ? settings : withSlot(settings, 'quota', { collapsedShow: next });
}
