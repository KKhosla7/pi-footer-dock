import type { MenuEntry } from '../settings-groups.js';
import { summary } from '../settings-groups.js';
import type { ExtensionRegistry } from './registry.js';

const PREFIX = 'ext:';
export const isExtensionRow = (id: string): boolean => id.startsWith(PREFIX);
/** `ext:<extension>:<row>` to its two parts. */
export function parseRowId(id: string): { ext: string; row: string } | undefined {
  const [, ext, row] = id.split(':');
  return ext && row ? { ext, row } : undefined;
}

/** One group per extension that registered settings, built from what it registered, nothing else. */
export function extensionEntries(registry: ExtensionRegistry): MenuEntry[] {
  return registry.all().flatMap((registration) => {
    if (!registration.settings) return [];
    const children: MenuEntry[] = registration.settings.rows.map((row) => ({
      id: `${PREFIX}${registration.ext}:${row.id}`,
      label: row.label,
      description: row.description,
      values: row.values,
      current: row.current,
      ...(row.default ? { default: row.default } : {}),
    }));
    return [
      {
        id: `${PREFIX}${registration.ext}`,
        label: registration.label,
        description: registration.settings.note || `Settings of ${registration.label}.`,
        values: [],
        current: summary(children),
        children,
      },
    ];
  });
}
