import { layerNames } from './looks.js';
import { HIDDEN, SHOWN, row, withNote } from './menu-row.js';
import type { MenuRow } from './menu-row.js';
import { settingsItems, withSlot } from './settings.js';
import type { Settings } from './settings.js';
import { layerText } from './settings-text.js';

/** A row of the menu for one part of an item: `layer:<item>:<part>`, shown or hidden. */
const PREFIX = 'layer:';
const split = (id: string): { item: string; part: string } | undefined => {
  const [prefix, item, part, ...more] = id.split(':');
  return `${prefix}:` === PREFIX && item && part && more.length === 0 ? { item, part } : undefined;
};
/** The item a layer row belongs to, or undefined for any other row. */
export const layerItem = (id: string): string | undefined => split(id)?.item;
export const isLayerRow = (id: string): boolean => split(id) !== undefined;
export const layerValues = (): string[] => [SHOWN, HIDDEN];

/** Whether this row names a part its item has (the only rows that may be written). */
export const isKnownLayerRow = (id: string): boolean => {
  const found = split(id);
  return (
    found !== undefined &&
    settingsItems().includes(found.item) &&
    (layerNames.get(found.item) ?? []).includes(found.part)
  );
};

/** One row for every part of every item that has parts, in the order the parts print. */
export function layerRows(settings: Settings): MenuRow[] {
  return settingsItems().flatMap((item) =>
    (layerNames.get(item) ?? []).map((part) => {
      const text = layerText.get(`${item}:${part}`);
      return withNote(
        row(
          `${PREFIX}${item}:${part}`,
          text?.label ?? `${item}: ${part}`,
          settings.slots[item]?.layers?.[part] === false ? HIDDEN : SHOWN,
          layerValues(),
        ),
        text?.note ?? '',
      );
    }),
  );
}

/** The settings after a part was shown or hidden; only parts switched off are kept in the file. */
export function layerChoice(settings: Settings, id: string, value: string): Settings {
  const found = split(id);
  if (!found || !isKnownLayerRow(id)) return settings;
  const next = { ...settings.slots[found.item]?.layers, [found.part]: value === SHOWN };
  const off = Object.entries(next).filter(([, on]) => !on);
  return withSlot(settings, found.item, {
    layers: off.length > 0 ? Object.fromEntries(off) : undefined,
  });
}
