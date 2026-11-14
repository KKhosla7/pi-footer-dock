import type { FooterConfig, FooterRow } from '../footer-config.js';
import type { ExtensionRegistry } from './registry.js';

export function withExtensionRows(
  config: FooterConfig,
  registry: ExtensionRegistry | undefined,
): FooterConfig {
  if (!registry || registry.size === 0) return config;
  const add = (row: FooterRow | undefined, number: 1 | 2 | 3): FooterRow => ({
    left: [...(row?.left ?? []), ...registry.ids(`row${number}.left`)],
    right: [...(row?.right ?? []), ...registry.ids(`row${number}.right`)],
  });
  const third = add(undefined, 3);
  const rows = [add(config.rows[0], 1), add(config.rows[1], 2)];
  if (third.left.length > 0 || third.right.length > 0) rows.push(third);
  return { ...config, rows };
}
