import { HIDDEN, SHOWN, row, savable, withNote } from './menu-row.js';
import type { MenuRow } from './menu-row.js';
import type { Settings } from './settings.js';
import { withSlot } from './settings.js';
import { keepWords, windowWords } from './settings-labels.js';

const MAX_LABELS = 8;
const PREFIX = 'collapsed:';

const visible = (settings: Settings, published: readonly string[]): string[] =>
  published.filter((label) => !(settings.slots.quota?.hideWindows ?? []).includes(label));
const kept = (settings: Settings, published: readonly string[]): string[] =>
  settings.slots.quota?.collapsedShow ?? visible(settings, published).slice(0, -1);

export function collapsedRows(settings: Settings, published: readonly string[]): MenuRow[] {
  const stays = kept(settings, published);
  const all = visible(settings, published);
  return all.filter(savable).map((label) => ({
    ...withNote(
      row(`${PREFIX}${label}`, keepWords(label).label, stays.includes(label) ? SHOWN : HIDDEN, [
        SHOWN,
        HIDDEN,
      ]),
      keepWords(label).note,
    ),
    default: label === all.at(-1) ? HIDDEN : SHOWN,
  }));
}

export const isCollapsedRow = (id: string): boolean => id.startsWith(PREFIX);
export const collapsedLabel = (id: string): string => id.slice(PREFIX.length);

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

export function windowRows(settings: Settings, published: readonly string[]): MenuRow[] {
  const hidden = settings.slots.quota?.hideWindows ?? [];
  return [...new Set([...published, ...hidden])]
    .filter(savable)
    .map((label) =>
      withNote(
        row(`window:${label}`, windowWords(label).label, hidden.includes(label) ? HIDDEN : SHOWN, [
          SHOWN,
          HIDDEN,
        ]),
        windowWords(label).note,
      ),
    );
}

export function windowChoice(settings: Settings, label: string, value: string): Settings {
  const others = (settings.slots.quota?.hideWindows ?? []).filter((item) => item !== label);
  const next = value === HIDDEN ? [...others, label] : others;
  return next.length > MAX_LABELS
    ? settings
    : withSlot(settings, 'quota', { hideWindows: next.length ? next : undefined });
}
