import type { RenderOptions } from './render-options.js';

export function problemMarker(options: RenderOptions, icon: string): string {
  const { count, bright } = options.problems ?? { count: 0, bright: true };
  if (count === 0) return '';
  const label = count === 1 ? '1 problem' : `${count} problems`;
  return options.paint(`${icon} ${label}`, bright ? 'error' : 'muted', 'bold');
}
